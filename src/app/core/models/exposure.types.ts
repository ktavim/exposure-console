/**
 * The backend's exposure API (network-interceptor, api/routes_exposures.py
 * and the Exposure* models in api/models.py). Every rule shown here, what is
 * in scope, what blocks planning, what to warn about, comes computed from the
 * backend; the console only displays it.
 */

export type ExposureStatus =
  | 'grouping'
  | 'planning'
  | 'awaiting_confirmation'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'cancelling'
  | 'cancelled'
  | 'superseded';

export const CLOSED_STATUSES: readonly ExposureStatus[] = ['deployed', 'cancelled', 'superseded'];

/** What the exposure does with one of its scan's services. */
export type ExposureScope =
  /** Cleared and not yet published: the exposure gives it a VIP. */
  | 'needs_vip'
  /** Already on the F5; the app's rewrite map uses its registry URL. */
  | 'published'
  /** Excluded on the scan. */
  | 'excluded'
  /** Published on the scan, but its registry entry has since been removed. */
  | 'unresolved';

export type AuthMethod =
  | 'ntlm'
  | 'kerberos'
  | 'negotiate'
  | 'oauth'
  | 'login_redirect'
  | 'basic'
  | 'bearer'
  | 'api_key'
  | 'other'
  | 'unauthenticated'
  | 'no_response'
  | 'dns_failed'
  | 'unknown';

export type Scanner = 'interceptor' | 'tracer';

export type Severity = 'blocker' | 'review' | 'cleared' | 'published';

export interface PublishedOrigin {
  id: string;
  scheme: string;
  host: string;
  port: number;
  note: string;
  added_by: string;
  added_at: string;
  removed_at: string | null;
  removed_by: string | null;
  /** The URL of the VIP that publishes the origin; null on an entry added by hand. */
  url: string | null;
  /** The exposure whose deploy registered the entry; null for one added by hand. */
  exposure_id: string | null;
}

/** A reason planning is blocked, or a warning about a service. */
export interface ExposureNotice {
  /** Stable, for the console to key on. */
  code: string;
  message: string;
  service_id: string | null;
}

export interface ExposureApp {
  id: string;
  name: string;
  /** Every app has one; its VIP is built from it. */
  url: string;
}

export interface ExposureSummary {
  id: string;
  status: ExposureStatus;
  version: number;
  app: ExposureApp;
  scan_id: string;
  submitted_at: string;
  submitted_by: string;
  created_at: string;
  needs_vip_count: number;
  blocked: boolean;
}

export interface ExposureGroup {
  id: string;
  service_ids: string[];
}

/**
 * One of the scan's services. The backend sends the whole scan service
 * (findings, evidence, sources); only the fields the console reads are typed.
 */
export interface ExposureService {
  id: string;
  scheme: string;
  host: string;
  port: number;
  auth_method: AuthMethod;
  severity: Severity;
  ips: string[] | null;
  found_by: Scanner[];
  excluded: boolean;
  scope: ExposureScope;
  group_id: string | null;
  registry_entry: PublishedOrigin | null;
  warnings: ExposureNotice[];
}

export interface ExposureDetail extends ExposureSummary {
  groups: ExposureGroup[];
  services: ExposureService[];
  blocked_by: ExposureNotice[];
  supersedes: string | null;
  superseded_by: string | null;
  /** The agent's plan, from awaiting_confirmation on; null before, and once the grouping changes. */
  plan: Plan | null;
  plan_hash: string | null;
  plan_version: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  /** Set while failed: the phase retry resumes, the step and the agent's message. */
  failed: { phase: AgentPhase; step: string | null; message: string | null } | null;
  /** Once deployed: what the agent created on the F5 and in DNS, and what the backend registered. */
  deployment: Deployment | null;
  deployed_at: string | null;
}

/** What the agent works on: each is a status, and the phase of a failure. */
export type AgentPhase = 'planning' | 'deploying' | 'cancelling';

/** A deployed exposure's references (exposure-agent, agent/deployer.py; core/exposure_lifecycle.py). */
export interface Deployment {
  partition: string;
  /** Where outside browsers reach the app. */
  public_url: string;
  /** The virtual servers this exposure deployed, as paths on the F5. */
  virtual_servers: string[];
  /** The records the agent created, each with the DNS service's id. */
  dns_records: { name: string; type: string; target: string; id: string | null }[];
  /** The origins added to the published-origins registry, with the URL that replaces each. */
  registered: { origin: string; url: string }[];
  /** Origins someone else registered between the plan and the deploy; their entries stand. */
  already_registered: { origin: string; url: string | null }[];
}

export interface PlanCertificate {
  /** Its path on the F5. The key is never in a plan. */
  name: string;
  names: string[];
  expires: string;
}

export interface PlanService {
  service_id: string;
  original: string;
  url: string;
  pool: string[];
  pool_scheme: string;
}

export interface PlanVip {
  group_id: string;
  ip: string;
  certificate: PlanCertificate;
  services: PlanService[];
}

export interface DiffLine {
  /** '+' added, '-' removed, ' ' context, '@' a hunk header. */
  op: '+' | '-' | ' ' | '@';
  text: string;
}

/** What the agent planned (exposure-agent, agent/planner.py). */
export interface Plan {
  partition: string;
  app: {
    name: string;
    url: string;
    public_url: string;
    ip: string;
    /** The app's VIP is deployed already; this plan changes its rewrite map. */
    existing: boolean;
    certificate: PlanCertificate | null;
  };
  vips: PlanVip[];
  /** new: a VIP this plan creates; published: a registry URL; app: the app's own origin, to its public URL. */
  rewrite: { original: string; url: string; source: 'new' | 'published' | 'app' }[];
  dns_records: { name: string; type: string; target: string }[];
  declaration: Record<string, unknown>;
  diff: DiffLine[];
  summary: { add: number; change: number; destroy: number; ips: number; dns: number; certificates: number };
}

/** One entry of an exposure's event log: an admin's action or a step the agent reported. */
export interface ExposureEvent {
  exposure_id: string;
  /** The stream's event id, a string of the sequence number. */
  seq: string;
  /** Milliseconds since the epoch. */
  ts: number;
  type: string;
  /** The admin's username, or "agent". */
  actor: string;
  payload: Record<string, unknown>;
}

/** The events that close an exposure; its stream ends after one. */
export const TERMINAL_EVENTS: readonly string[] = ['exposure_superseded', 'exposure_cancelled', 'exposure_deployed'];
