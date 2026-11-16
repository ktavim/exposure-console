import planJson from './plan.json';
import type {
  AuthMethod,
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
    url
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
function blockers(app_url: string | null, services: ExposureService[]): ExposureNotice[] {
  const out: ExposureNotice[] = [];
  if (!app_url) out.push({ code: 'app_url_missing', message: 'The app has no URL; set one to plan its VIP.', service_id: null });
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
type PlanFields = 'plan' | 'plan_hash' | 'plan_version' | 'confirmed_by' | 'confirmed_at' | 'failed';

function exposure(
  base: Omit<ExposureDetail, Derived | PlanFields> & Partial<Pick<ExposureDetail, PlanFields>>,
  groupCount: number,
  specs: ServiceSpec[]
): ExposureDetail {
  const groupIds = Array.from({ length: groupCount }, () => id('grp'));
  const services = specs
    .map((spec) => service(spec, groupIds))
    .sort((a, b) => a.host.localeCompare(b.host) || a.port - b.port);
  const blocked_by = blockers(base.app.url, services);
  return {
    plan: null,
    plan_hash: null,
    plan_version: null,
    confirmed_by: null,
    confirmed_at: null,
    failed: null,
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
      app: { id: 'app_timesheets', name: 'Timesheets', url: null },
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
  )
];

/** Recompute what the backend derives, after a mock write changed an exposure. */
export function refresh(e: ExposureDetail): void {
  e.blocked_by = blockers(e.app.url, e.services);
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
  if (e.superseded_by) {
    const by = EXPOSURES.find((x) => x.id === e.superseded_by);
    out.push({ ts: at(by?.submitted_at ?? e.submitted_at), type: 'exposure_superseded', actor: by?.submitted_by ?? 'jchen', payload: { by: e.superseded_by } });
  }
  return out.map((event, i) => ({ ...event, seq: String(i), exposure_id: exposureId }));
}
