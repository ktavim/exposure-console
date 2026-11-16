import { delay, http, HttpResponse, sse } from 'msw';
import { CLOSED_STATUSES, type ExposureNotice, type ExposureStatus } from '@core/models';
import { formatOrigin } from '@lib/origin';
import { EXPOSURES, PLAN, eventsFor, refresh, toSummary } from '../fixtures/exposures';

const EDITABLE: ExposureStatus[] = ['grouping', 'planning', 'awaiting_confirmation'];
const CANCELLABLE: ExposureStatus[] = ['grouping', 'planning', 'awaiting_confirmation', 'failed'];

/** How long the mock agent takes over a phase. */
const AGENT_MS = 2500;
let groupIds = 0;

const notFound = (what: string) => HttpResponse.json({ detail: { message: `${what} not found` } }, { status: 404 });

/** FastAPI's shape for a request that fails validation. */
const invalid = (msg: string) => HttpResponse.json({ detail: [{ loc: ['body', 'url'], msg, type: 'value_error' }] }, { status: 422 });

/** The backend's exposure endpoints over the fixtures, with its rules for writes. */
export const handlers = [
  // The event log. Open exposures' streams stay open, as the backend's do;
  // nothing new arrives in the mock.
  sse<{ message: string }>('/api/exposures/:id/events', ({ params, client }) => {
    for (const event of eventsFor(String(params['id']))) {
      client.send({ id: event.seq, data: JSON.stringify(event) });
    }
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
    refresh(e);
    return HttpResponse.json(e);
  }),

  http.patch('/api/apps/:id', async ({ params, request }) => {
    await delay(300);
    const { url } = (await request.json()) as { url: string };
    if (!/^https?:\/\/[^/\s]+/i.test(url.trim())) return invalid('Value error, the URL must start with http:// or https://');
    const mine = EXPOSURES.filter((e) => e.app.id === params['id']);
    if (!mine.length) return notFound('app');
    for (const e of mine) {
      e.app.url = url.trim().replace(/\/+$/, '');
      refresh(e);
    }
    return HttpResponse.json({ id: params['id'], url: mine[0].app.url });
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

  // Request a plan, confirm it, retry or cancel. The mock agent answers a
  // plan request with the fixture plan after a pause; a cancel, by closing.
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
      const version = e.version;
      setTimeout(() => {
        if (e.status !== 'planning' || e.version !== version) return;
        e.status = 'awaiting_confirmation';
        e.plan = PLAN;
        e.plan_hash = `sha256:mock${version}`;
        e.plan_version = version;
      }, AGENT_MS);
    } else if (action === 'confirm') {
      if (e.status !== 'awaiting_confirmation') return refuse(`a ${e.status} exposure cannot be confirmed`);
      if (body.plan_hash !== e.plan_hash) return refuse("that is not the exposure's current plan", { plan_hash: e.plan_hash });
      e.status = 'deploying';
      e.confirmed_by = 'jchen';
      e.confirmed_at = new Date().toISOString();
    } else if (action === 'retry') {
      if (e.status !== 'failed' || !e.failed) return refuse(`a ${e.status} exposure cannot be retried`);
      e.status = e.failed.phase;
      e.failed = null;
    } else if (action === 'cancel') {
      if (!CANCELLABLE.includes(e.status)) return refuse(`a ${e.status} exposure cannot be cancelled`);
      e.version += 1;
      e.status = e.plan || e.status !== 'grouping' ? 'cancelling' : 'cancelled';
      if (e.status === 'cancelling') setTimeout(() => (e.status = 'cancelled'), AGENT_MS);
    } else {
      return notFound('action');
    }
    refresh(e);
    return HttpResponse.json(e);
  })
];
