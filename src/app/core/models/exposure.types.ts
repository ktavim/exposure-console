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
  url: string | null;
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
}
