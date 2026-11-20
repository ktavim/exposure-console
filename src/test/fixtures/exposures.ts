import planJson from './plan.json';
import type {
  AgentPhase,
  AuthMethod,
  Deployment,
  Plan,
  ExposureDetail,
  ExposureEvent,
  ExposureNotice,
  ExposureService,
  ExposureSummary,
  PublishedOrigin,
  Scanner
} from '@core/models';
import { formatOrigin } from '@lib/origin';

/**
 * Exposures shaped as the backend returns them, for MSW and the specs. The
 * notices' wording follows core/exposures.py in network-interceptor.
 */

let nextId = 0;
const id = (prefix: string) => `${prefix}_${(++nextId).toString(16).padStart(10, '0')}`;

function entry(host: string, url: string | null): PublishedOrigin {
  return {
    id: id('pub'),
    scheme: 'https',
    host,
    port: 443,
    note: 'vs_legacy_portal',
    added_by: 'mlevi',
    added_at: '2026-10-02T09:00:00+00:00',
    removed_at: null,
    removed_by: null,
    url,
    exposure_id: null
  };
}

interface ServiceSpec {
  host: string;
  port?: number;
  scheme?: string;
  auth?: AuthMethod;
  scope?: ExposureService['scope'];
  found_by?: Scanner[];
  group?: number;
  registry?: PublishedOrigin;
}

function service(spec: ServiceSpec, groupIds: string[]): ExposureService {
  const s: ExposureService = {
    id: id('svc'),
    scheme: spec.scheme ?? 'https',
    host: spec.host,
    port: spec.port ?? 443,
    auth_method: spec.auth ?? 'bearer',
    severity: spec.scope === 'published' ? 'published' : spec.scope === 'excluded' ? 'blocker' : 'cleared',
    ips: ['10.20.4.11', '10.20.4.12'],
    found_by: spec.found_by ?? ['interceptor', 'tracer'],
    excluded: spec.scope === 'excluded',
    scope: spec.scope ?? 'needs_vip',
    group_id: spec.group !== undefined ? groupIds[spec.group] : null,
    registry_entry: spec.registry ?? null,
    warnings: []
  };
  if (s.scope === 'needs_vip' || s.scope === 'published') {
    if (!s.found_by.includes('tracer')) {
      s.warnings.push({
        code: 'interceptor_only',
        message:
          'Found only by the interceptor: the app may assemble this origin at runtime, where the F5 cannot rewrite it.',
        service_id: s.id
      });
    }
    if (s.auth_method === 'login_redirect') {
      s.warnings.push({
        code: 'login_redirect',
        message: "Login redirect: its identity provider must accept a redirect URI on the app's new name.",
        service_id: s.id
      });
    }
  }
  return s;
}

/** What core.exposures.assess blocks planning on. */
function blockers(services: ExposureService[]): ExposureNotice[] {
  const out: ExposureNotice[] = [];
  for (const s of services) {
    const origin = formatOrigin(s);
    if (s.scope === 'needs_vip' && !s.group_id) {
      out.push({ code: 'service_ungrouped', message: `${origin} is not in a VIP group.`, service_id: s.id });
    }
    if (s.scope === 'needs_vip' && s.auth_method === 'kerberos') {
      out.push({
        code: 'kerberos_unsupported',
        message: `${origin} uses Kerberos, which cannot be published yet; exclude it on a new scan, or wait for Kerberos support.`,
        service_id: s.id
      });
    }
    if (s.scope === 'published' && !s.registry_entry?.url) {
      out.push({
        code: 'published_url_missing',
        message: `${origin} is published, but its registry entry has no URL for the app's rewrite map.`,
        service_id: s.id
      });
    }
  }
  return out;
}

type Derived = 'groups' | 'services' | 'blocked_by' | 'needs_vip_count' | 'blocked';
type PlanFields = 'plan' | 'plan_hash' | 'plan_version' | 'confirmed_by' | 'confirmed_at' | 'failed' | 'deployment' | 'deployed_at';

function exposure(
  base: Omit<ExposureDetail, Derived | PlanFields> & Partial<Pick<ExposureDetail, PlanFields>>,
  groupCount: number,
  specs: ServiceSpec[]
): ExposureDetail {
  const groupIds = Array.from({ length: groupCount }, () => id('grp'));
  const services = specs
    .map((spec) => service(spec, groupIds))
    .sort((a, b) => a.host.localeCompare(b.host) || a.port - b.port);
  const blocked_by = blockers(services);
  return {
    plan: null,
    plan_hash: null,
    plan_version: null,
    confirmed_by: null,
    confirmed_at: null,
    failed: null,
    deployment: null,
    deployed_at: null,
    ...base,
    groups: groupIds.map((g) => ({ id: g, service_ids: services.filter((s) => s.group_id === g).map((s) => s.id) })),
    services,
    blocked_by,
    needs_vip_count: services.filter((s) => s.scope === 'needs_vip').length,
    blocked: blocked_by.length > 0
  };
}

/** The plan the agent made for a real exposure (exposure-agent, fake adapters), renamed to Expenses. */
export const PLAN = planJson as Plan;

/** The same plan for another app: its names replaced, its addresses moved along the range. */
function planFor(app: string, reports: string, ipDigit: number): Plan {
  return JSON.parse(
    JSON.stringify(PLAN)
      .replaceAll('expenses', app.toLowerCase())
      .replaceAll('Expenses', app)
      .replaceAll('reports', reports)
      .replaceAll('"203.0.113.', `"203.0.113.${ipDigit}`)
  ) as Plan;
}

/** What a deploy of `plan` leaves behind, as the agent and the backend report it. */
export function deploymentFrom(plan: Plan): Deployment {
  return {
    partition: plan.partition,
    public_url: plan.app.public_url,
    virtual_servers: [...plan.vips.map((v) => `/${plan.partition}/app/vs_${v.group_id}`), `/${plan.partition}/app/vs_app`],
    dns_records: plan.dns_records.map((r, i) => ({ ...r, id: `rec_${(i + 1).toString().padStart(4, '0')}` })),
    registered: [
      ...plan.vips.flatMap((v) => v.services.map((s) => ({ origin: s.original, url: s.url }))),
      { origin: new URL(plan.app.url).origin, url: plan.app.public_url }
    ],
    already_registered: []
  };
}

/** What the agent reports for each step of a phase, done, for `plan`. */
export function mockSteps(phase: AgentPhase, plan: Plan): { step: string; message: string }[] {
  const ips = [...plan.vips.map((v) => `${v.group_id} ${v.ip}`), `app ${plan.app.ip}`];
  const diff = `+${plan.summary.add} ~${plan.summary.change} -${plan.summary.destroy}`;
  return {
    planning: [
      { step: 'names', message: `${plan.dns_records.length} names in example.com` },
      { step: 'reserve_ips', message: ips.join(', ') },
      { step: 'certificates', message: `${plan.summary.certificates} issued, 0 reused` },
      { step: 'render', message: `${plan.vips.length} VIPs and the app's` },
      { step: 'dry_run', message: diff }
    ],
    deploying: [
      { step: 'recheck', message: `as planned: ${diff}` },
      { step: 'deploy', message: `posted to ${plan.partition}` },
      { step: 'verify', message: `${plan.vips.length + 1} virtual servers up; the app's responses are rewritten` },
      { step: 'dns', message: `${plan.dns_records.length} records in example.com` }
    ],
    cancelling: [
      { step: 'remove_dns', message: 'none created' },
      { step: 'restore_declaration', message: 'nothing deployed' },
      { step: 'remove_certificates', message: `${plan.summary.certificates} removed` },
      { step: 'release_ips', message: ips.map((x) => x.split(' ')[1]).join(', ') }
    ]
  }[phase];
}

const TRAVEL_PLAN = planFor('Travel', 'bookings', 1);
const INVENTORY_PLAN = planFor('Inventory', 'stock', 2);

const payrollOld = id('exp');
const payroll = id('exp');

export const EXPOSURES: ExposureDetail[] = [
  exposure(
    {
      id: payroll,
      status: 'grouping',
      version: 1,
      app: { id: 'app_payroll', name: 'Payroll v3', url: 'https://payroll.corp.internal' },
      scan_id: 'b3f0c2a9e1d84c6f9a1b2c3d4e5f6a7b',
      submitted_at: '2026-11-12T08:41:00+00:00',
      submitted_by: 'jchen',
      created_at: '2026-11-12T08:41:00+00:00',
      supersedes: payrollOld,
      superseded_by: null
    },
    2,
    [
      { host: 'api.payroll.corp.internal', group: 0 },
      { host: 'api.payroll.corp.internal', port: 8443, group: 0 },
      { host: 'reports.corp.internal', group: 1, found_by: ['interceptor'] },
      { host: 'sso.corp.internal', auth: 'login_redirect', group: 1 },
      { host: 'hr-legacy.corp.internal', auth: 'ntlm', scope: 'published', registry: entry('hr-legacy.corp.internal', 'https://hr-legacy.example.com') },
      { host: 'metrics.corp.internal', auth: 'basic', scope: 'excluded' }
    ]
  ),
  exposure(
    {
      id: id('exp'),
      status: 'grouping',
      version: 3,
      app: { id: 'app_timesheets', name: 'Timesheets', url: 'https://timesheets.corp.internal' },
      scan_id: 'c1d2e3f4a5b64c7d8e9f0a1b2c3d4e5f',
      submitted_at: '2026-11-14T13:05:00+00:00',
      submitted_by: 'rkatz',
      created_at: '2026-11-14T13:05:00+00:00',
      supersedes: null,
      superseded_by: null
    },
    1,
    [
      { host: 'timesheets-api.corp.internal', group: 0 },
      { host: 'directory.corp.internal', auth: 'kerberos', group: 0 },
      { host: 'files.corp.internal', auth: 'ntlm', scope: 'published', registry: entry('files.corp.internal', null) }
    ]
  ),
  exposure(
    {
      id: payrollOld,
      status: 'superseded',
      version: 2,
      app: { id: 'app_payroll', name: 'Payroll v3', url: 'https://payroll.corp.internal' },
      scan_id: 'a9e8d7c6b5a44f3e2d1c0b9a8f7e6d5c',
      submitted_at: '2026-11-03T15:20:00+00:00',
      submitted_by: 'jchen',
      created_at: '2026-11-03T15:20:00+00:00',
      supersedes: null,
      superseded_by: payroll
    },
    1,
    [{ host: 'api.payroll.corp.internal', group: 0 }]
  ),
  exposure(
    {
      id: id('exp'),
      status: 'awaiting_confirmation',
      version: 2,
      app: { id: 'app_expenses', name: 'Expenses', url: 'https://expenses.corp.internal' },
      scan_id: 'd4e5f6a7b8c94d0e1f2a3b4c5d6e7f80',
      submitted_at: '2026-11-15T09:12:00+00:00',
      submitted_by: 'mlevi',
      created_at: '2026-11-15T09:12:00+00:00',
      supersedes: null,
      superseded_by: null,
      plan: PLAN,
      plan_hash: 'sha256:a56fa83ee4f12c0b7d1e9a4f3b2c8d6e5f7a1b3c9d2e4f6a8b0c1d3e5f7a9b2c',
      plan_version: 2
    },
    2,
    [
      { host: 'api.expenses.corp.internal', group: 0 },
      { host: 'api.expenses.corp.internal', port: 8443, group: 0 },
      { host: 'reports.corp.internal', group: 1, found_by: ['interceptor'] }
    ]
  ),
  exposure(
    {
      id: id('exp'),
      status: 'deployed',
      version: 1,
      app: { id: 'app_travel', name: 'Travel', url: 'https://travel.corp.internal' },
      scan_id: 'e5f6a7b8c9d04e1f2a3b4c5d6e7f8091',
      submitted_at: '2026-11-06T10:30:00+00:00',
      submitted_by: 'rkatz',
      created_at: '2026-11-06T10:30:00+00:00',
      supersedes: null,
      superseded_by: null,
      plan: TRAVEL_PLAN,
      plan_hash: 'sha256:7c1e0b9d2f4a6c8e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a5c7e',
      plan_version: 1,
      confirmed_by: 'mlevi',
      confirmed_at: '2026-11-06T14:02:00+00:00',
      deployment: deploymentFrom(TRAVEL_PLAN),
      deployed_at: '2026-11-06T14:04:00+00:00'
    },
    2,
    [
      { host: 'api.travel.corp.internal', group: 0 },
      { host: 'api.travel.corp.internal', port: 8443, group: 0 },
      { host: 'bookings.corp.internal', group: 1 }
    ]
  ),
  exposure(
    {
      id: id('exp'),
      status: 'failed',
      version: 1,
      app: { id: 'app_inventory', name: 'Inventory', url: 'https://inventory.corp.internal' },
      scan_id: 'f6a7b8c9d0e14f2a3b4c5d6e7f8091a2',
      submitted_at: '2026-11-13T11:15:00+00:00',
      submitted_by: 'jchen',
      created_at: '2026-11-13T11:15:00+00:00',
      supersedes: null,
      superseded_by: null,
      plan: INVENTORY_PLAN,
      plan_hash: 'sha256:3b5d7f9a1c2e4b6d8f0a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b1d3f5a7c9e2b4d',
      plan_version: 1,
      confirmed_by: 'jchen',
      confirmed_at: '2026-11-16T09:40:00+00:00',
      failed: {
        phase: 'deploying',
        step: 'verify',
        message: "the app's responses still name https://stock.corp.internal: the F5 is not rewriting them"
      }
    },
    2,
    [
      { host: 'api.inventory.corp.internal', group: 0 },
      { host: 'api.inventory.corp.internal', port: 8443, group: 0 },
      { host: 'stock.corp.internal', group: 1 }
    ]
  )
];

/** Recompute what the backend derives, after a mock write changed an exposure. */
export function refresh(e: ExposureDetail): void {
  e.blocked_by = blockers(e.services);
  e.blocked = e.blocked_by.length > 0;
  e.needs_vip_count = e.services.filter((s) => s.scope === 'needs_vip').length;
}

export function toSummary(e: ExposureDetail): ExposureSummary {
  const { id, status, version, app, scan_id, submitted_at, submitted_by, created_at, needs_vip_count, blocked } = e;
  return { id, status, version, app, scan_id, submitted_at, submitted_by, created_at, needs_vip_count, blocked };
}

/** Each fixture exposure's event log, as the backend would have recorded it. */
export function eventsFor(exposureId: string): ExposureEvent[] {
  const e = EXPOSURES.find((x) => x.id === exposureId);
  if (!e) return [];
  const at = (iso: string, minutes = 0) => Date.parse(iso) + minutes * 60_000;
  const out: Omit<ExposureEvent, 'seq' | 'exposure_id'>[] = [
    { ts: at(e.submitted_at), type: 'exposure_created', actor: e.submitted_by, payload: { scan_id: e.scan_id, supersedes: e.supersedes } }
  ];
  for (let version = 2; version <= e.version; version++) {
    out.push({ ts: at(e.submitted_at, 60 * version), type: 'grouping_saved', actor: 'mlevi', payload: { version } });
  }
  if (e.plan) {
    const version = e.plan_version ?? e.version;
    const t = at(e.submitted_at, 90);
    out.push({ ts: t, type: 'plan_requested', actor: e.submitted_by, payload: { version } });
    mockSteps('planning', e.plan).forEach(({ step, message }, i) => {
      out.push({ ts: t + 1000 * (2 * i + 1), type: 'agent_step', actor: 'agent', payload: { version, step, state: 'started', message: null } });
      out.push({ ts: t + 1000 * (2 * i + 2), type: 'agent_step', actor: 'agent', payload: { version, step, state: 'done', message } });
    });
    out.push({ ts: t + 15_000, type: 'plan_ready', actor: 'agent', payload: { version, plan_hash: e.plan_hash, summary: e.plan.summary } });
  }
  if (e.plan && e.confirmed_by && e.confirmed_at) {
    const version = e.plan_version ?? e.version;
    const t = Date.parse(e.confirmed_at);
    out.push({ ts: t, type: 'plan_confirmed', actor: e.confirmed_by, payload: { version, plan_hash: e.plan_hash } });
    const failedAt = e.failed?.phase === 'deploying' ? e.failed.step : null;
    for (const [i, { step, message }] of mockSteps('deploying', e.plan).entries()) {
      out.push({ ts: t + 1000 * (2 * i + 1), type: 'agent_step', actor: 'agent', payload: { version, step, state: 'started', message: null } });
      if (step === failedAt) {
        out.push({ ts: t + 1000 * (2 * i + 2), type: 'agent_step', actor: 'agent', payload: { version, step, state: 'failed', message: e.failed?.message } });
        out.push({ ts: t + 1000 * (2 * i + 2), type: 'deploying_failed', actor: 'agent', payload: { step, message: e.failed?.message } });
        break;
      }
      out.push({ ts: t + 1000 * (2 * i + 2), type: 'agent_step', actor: 'agent', payload: { version, step, state: 'done', message } });
    }
    if (e.deployment) {
      const { registered, already_registered } = e.deployment;
      out.push({ ts: t + 12_000, type: 'origins_registered', actor: 'agent', payload: { registered, already_registered } });
      out.push({ ts: t + 12_000, type: 'exposure_deployed', actor: 'agent', payload: { public_url: e.deployment.public_url } });
    }
  }
  if (e.superseded_by) {
    const by = EXPOSURES.find((x) => x.id === e.superseded_by);
    out.push({ ts: at(by?.submitted_at ?? e.submitted_at), type: 'exposure_superseded', actor: by?.submitted_by ?? 'jchen', payload: { by: e.superseded_by } });
  }
  return out.map((event, i) => ({ ...event, seq: String(i), exposure_id: exposureId }));
}
