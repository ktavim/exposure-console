import { delay, http, HttpResponse, sse } from 'msw';
import {
  type AgentPhase,
  CLOSED_STATUSES,
  type ExposureDetail,
  type ExposureEvent,
  type ExposureNotice,
  type ExposureStatus
} from '@core/models';
import { stepBegun } from '@lib/agent-steps';
import { formatOrigin } from '@lib/origin';
import { EXPOSURES, PLAN, deploymentFrom, eventsFor, mockSteps, refresh, toSummary } from '../fixtures/exposures';

const EDITABLE: ExposureStatus[] = ['grouping', 'planning', 'awaiting_confirmation'];
const CANCELLABLE: ExposureStatus[] = ['grouping', 'planning', 'awaiting_confirmation', 'failed'];

/** How long the mock agent takes over a step. */
const STEP_MS = 1500;
let groupIds = 0;

// ---- The event log: the fixtures' history, then what happens in this page --------

interface Client {
  send(message: { id: string; data: string }): void;
}
const HISTORY = new Map(EXPOSURES.map((e) => [e.id, eventsFor(e.id)]));
const live = new Map<string, ExposureEvent[]>();
const clients = new Map<string, Set<Client>>();

const allEvents = (id: string): ExposureEvent[] => [...(HISTORY.get(id) ?? []), ...(live.get(id) ?? [])];

/** Record an event, as the backend does with each status change, and stream it to open workspaces. */
function record(e: ExposureDetail, type: string, actor: string, payload: Record<string, unknown>): void {
  const event: ExposureEvent = { exposure_id: e.id, seq: String(allEvents(e.id).length), ts: Date.now(), type, actor, payload };
  live.set(e.id, [...(live.get(e.id) ?? []), event]);
  for (const client of clients.get(e.id) ?? []) {
    try {
      client.send({ id: event.seq, data: JSON.stringify(event) });
    } catch {
      clients.get(e.id)?.delete(client);
    }
  }
}

// ---- The mock agent ----------------------------------------------------------------

/**
 * Play the agent through a phase: report each step started, then done,
 * a step apart, and finish. A deploy resumed by a retry skips the steps
 * done before. Stops if the exposure moves on meanwhile, as a stale
 * result is dropped.
 */
function playAgent(e: ExposureDetail, phase: AgentPhase): void {
  const version = e.version;
  const plan = e.plan ?? PLAN;
  const steps = mockSteps(phase, plan).map((s) => ({ ...s, message: cancelMessage(e, phase, s.step) ?? s.message }));
  const doneBefore = (step: string) =>
    allEvents(e.id).some((ev) => ev.type === 'agent_step' && ev.payload['version'] === version && ev.payload['step'] === step && ev.payload['state'] === 'done');
  const reports = steps.flatMap(({ step, message }) =>
    phase === 'deploying' && doneBefore(step)
      ? [{ step, state: 'skipped', message: 'done in an earlier attempt' }]
      : [{ step, state: 'started', message: null }, { step, state: 'done', message }]
  );
  const next = (i: number) => {
    if (e.status !== phase || e.version !== version) return;
    if (i === reports.length) {
      finish(e, phase, version);
      refresh(e);
      return;
    }
    record(e, 'agent_step', 'agent', { version, ...reports[i], detail: {} });
    setTimeout(() => next(i + 1), reports[i].state === 'started' ? STEP_MS : STEP_MS / 3);
  };
  setTimeout(() => next(0), STEP_MS);
}

/** What cancelling says of the steps that undo a deploy, from what the deploy began. */
function cancelMessage(e: ExposureDetail, phase: AgentPhase, step: string): string | null {
  if (phase !== 'cancelling' || !e.plan) return null;
  const deployed = (s: string) => stepBegun(allEvents(e.id), e.version - 1, s);
  if (step === 'remove_dns' && deployed('dns')) return `${e.plan.dns_records.length} deleted`;
  if (step === 'restore_declaration' && deployed('deploy')) return `removed ${e.plan.partition}, which had nothing before`;
  return null;
}

/** The agent's result for a phase, applied as the backend applies it. */
function finish(e: ExposureDetail, phase: AgentPhase, version: number): void {
  if (phase === 'planning') {
    e.status = 'awaiting_confirmation';
    e.plan = PLAN;
    e.plan_hash = `sha256:mock${version}`;
    e.plan_version = version;
    record(e, 'plan_ready', 'agent', { version, plan_hash: e.plan_hash, summary: PLAN.summary });
  } else if (phase === 'deploying' && e.plan) {
    e.status = 'deployed';
    e.deployment = deploymentFrom(e.plan);
    e.deployed_at = new Date().toISOString();
    const { registered, already_registered } = e.deployment;
    record(e, 'origins_registered', 'agent', { registered, already_registered });
    record(e, 'exposure_deployed', 'agent', { public_url: e.deployment.public_url });
  } else {
    e.status = e.superseded_by ? 'superseded' : 'cancelled';
    record(e, e.superseded_by ? 'exposure_superseded' : 'exposure_cancelled', 'agent', {});
  }
}

const notFound = (what: string) => HttpResponse.json({ detail: { message: `${what} not found` } }, { status: 404 });

/** FastAPI's shape for a request that fails validation. */
const invalid = (msg: string) => HttpResponse.json({ detail: [{ loc: ['body', 'url'], msg, type: 'value_error' }] }, { status: 422 });

/** The backend's exposure endpoints over the fixtures, with its rules for writes. */
export const handlers = [
  // The event log so far, then each event as the mock records it. A
  // reconnect gets the whole log again; the console keeps each event once.
  sse<{ message: string }>('/api/exposures/:id/events', ({ params, client, request }) => {
    const id = String(params['id']);
    for (const event of allEvents(id)) {
      client.send({ id: event.seq, data: JSON.stringify(event) });
    }
    const open = clients.get(id) ?? new Set<Client>();
    open.add(client);
    clients.set(id, open);
    request.signal.addEventListener('abort', () => open.delete(client));
  }),

  http.get('/api/exposures', async ({ request }) => {
    await delay(150);
    const statuses = new URL(request.url).searchParams.getAll('status') as ExposureStatus[];
    const open = statuses.length === 0;
    const selected = EXPOSURES.filter((e) =>
      open ? !CLOSED_STATUSES.includes(e.status) : statuses.includes(e.status)
    ).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) * (open ? 1 : -1));
    return HttpResponse.json(selected.map(toSummary));
  }),

  http.get('/api/exposures/:id', async ({ params }) => {
    await delay(150);
    const exposure = EXPOSURES.find((e) => e.id === params['id']);
    return exposure ? HttpResponse.json(exposure) : notFound('exposure');
  }),

  http.put('/api/exposures/:id/groups', async ({ params, request }) => {
    await delay(300);
    const e = EXPOSURES.find((x) => x.id === params['id']);
    if (!e) return notFound('exposure');
    const body = (await request.json()) as { version: number; groups: { id?: string; service_ids: string[] }[] };
    const conflict = (message: string) =>
      HttpResponse.json({ detail: { message, status: e.status, version: e.version } }, { status: 409 });
    if (!EDITABLE.includes(e.status)) return conflict(`the grouping of a ${e.status} exposure cannot change`);
    if (body.version !== e.version) {
      return conflict(`the exposure is at version ${e.version}; this grouping was made against version ${body.version}`);
    }
    const from = e.status;

    const errors: ExposureNotice[] = [];
    const seen = new Set<string>();
    for (const id of body.groups.flatMap((g) => g.service_ids)) {
      const s = e.services.find((x) => x.id === id);
      if (!s) errors.push({ code: 'unknown_service', message: `${id} is not a service of this exposure's scan.`, service_id: id });
      else if (s.scope !== 'needs_vip') errors.push({ code: 'not_in_scope', message: `${formatOrigin(s)} does not need a VIP (${s.scope}).`, service_id: id });
      else if (seen.has(id)) errors.push({ code: 'duplicate', message: `${formatOrigin(s)} is in more than one group.`, service_id: id });
      seen.add(id);
    }
    for (const s of e.services) {
      if (s.scope === 'needs_vip' && !seen.has(s.id)) {
        errors.push({ code: 'service_ungrouped', message: `${formatOrigin(s)} is not in a group.`, service_id: s.id });
      }
    }
    if (errors.length) {
      return HttpResponse.json(
        { detail: { message: 'each service that needs a VIP must be in exactly one group', errors } },
        { status: 422 }
      );
    }

    const known = new Set(e.groups.map((g) => g.id));
    e.groups = body.groups
      .filter((g) => g.service_ids.length)
      .map((g) => ({ id: g.id && known.has(g.id) ? g.id : `grp_mock${++groupIds}`, service_ids: g.service_ids }));
    for (const s of e.services) s.group_id = e.groups.find((g) => g.service_ids.includes(s.id))?.id ?? null;
    e.version += 1;
    e.status = 'grouping';
    e.plan = e.plan_hash = e.plan_version = null;
    record(e, 'grouping_saved', 'jchen', { version: e.version, groups: e.groups.length, ...(from !== 'grouping' ? { from_status: from } : {}) });
    refresh(e);
    return HttpResponse.json(e);
  }),

  http.patch('/api/published-origins/:id', async ({ params, request }) => {
    await delay(300);
    const { url } = (await request.json()) as { url: string };
    if (!/^https:\/\/[^/\s]+/i.test(url.trim())) return invalid('Value error, the URL must start with https://');
    const entries = EXPOSURES.flatMap((e) => e.services.map((s) => s.registry_entry)).filter((r) => r?.id === params['id']);
    if (!entries.length) return notFound('published origin');
    for (const entry of entries) if (entry) entry.url = url.trim().replace(/\/+$/, '');
    EXPOSURES.forEach(refresh);
    return HttpResponse.json(entries[0]);
  })
,

  // Request a plan, confirm it, retry or cancel. The mock agent reports
  // each step of the phase, then answers a plan request with the fixture
  // plan, a deploy by deploying it, and a cancel by closing.
  http.post('/api/exposures/:id/:action', async ({ params, request }) => {
    await delay(250);
    const e = EXPOSURES.find((x) => x.id === params['id']);
    if (!e) return notFound('exposure');
    const action = String(params['action']);
    const body = (await request.json()) as { version: number; plan_hash?: string };
    const refuse = (message: string, extra: Record<string, unknown> = {}) =>
      HttpResponse.json({ detail: { message, status: e.status, version: e.version, ...extra } }, { status: 409 });
    if (body.version !== e.version) return refuse(`the exposure is at version ${e.version}; this was asked of version ${body.version}`);

    if (action === 'plan') {
      if (e.status !== 'grouping') return refuse(`a ${e.status} exposure cannot be planned`);
      if (e.blocked_by.length) return refuse('the exposure cannot be planned while something blocks planning', { blocked_by: e.blocked_by });
      e.status = 'planning';
      record(e, 'plan_requested', 'jchen', { version: e.version });
      playAgent(e, 'planning');
    } else if (action === 'confirm') {
      if (e.status !== 'awaiting_confirmation') return refuse(`a ${e.status} exposure cannot be confirmed`);
      if (body.plan_hash !== e.plan_hash) return refuse("that is not the exposure's current plan", { plan_hash: e.plan_hash });
      e.status = 'deploying';
      e.confirmed_by = 'jchen';
      e.confirmed_at = new Date().toISOString();
      record(e, 'plan_confirmed', 'jchen', { version: e.version, plan_hash: e.plan_hash });
      playAgent(e, 'deploying');
    } else if (action === 'retry') {
      if (e.status !== 'failed' || !e.failed) return refuse(`a ${e.status} exposure cannot be retried`);
      const phase = e.failed.phase;
      e.status = phase;
      e.failed = null;
      record(e, 'retry_requested', 'jchen', { phase });
      playAgent(e, phase);
    } else if (action === 'cancel') {
      if (!CANCELLABLE.includes(e.status)) return refuse(`a ${e.status} exposure cannot be cancelled`);
      e.version += 1;
      e.failed = null;
      e.status = e.plan || e.status !== 'grouping' ? 'cancelling' : 'cancelled';
      if (e.status === 'cancelling') {
        record(e, 'cancel_requested', 'jchen', { version: e.version });
        playAgent(e, 'cancelling');
      } else {
        record(e, 'exposure_cancelled', 'jchen', {});
      }
    } else {
      return notFound('action');
    }
    refresh(e);
    return HttpResponse.json(e);
  })
];
