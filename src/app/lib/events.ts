import type { ExposureEvent } from '@core/models';

export type EventTone = 'neutral' | 'accent' | 'ok' | 'danger' | 'muted';

export interface EventPresentation {
  /** What happened, as a sentence without its actor. */
  text: string;
  tone: EventTone;
  /** An exposure the event names, for a link. */
  link?: { prefix: string; exposureId: string };
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** How the event log reads an event. Types it does not know read as their name. */
export function describeEvent(event: ExposureEvent): EventPresentation {
  const p = event.payload;
  switch (event.type) {
    case 'exposure_created': {
      const scan = str(p['scan_id'])?.slice(0, 8);
      const supersedes = str(p['supersedes']);
      return {
        text: scan ? `Submitted scan ${scan}; exposure created` : 'Exposure created',
        tone: 'accent',
        link: supersedes ? { prefix: 'replacing', exposureId: supersedes } : undefined
      };
    }
    case 'exposure_superseded': {
      const by = str(p['by']);
      return { text: 'Superseded by a newer submission', tone: 'muted', link: by ? { prefix: '', exposureId: by } : undefined };
    }
    case 'grouping_saved': {
      const version = p['version'];
      const saved = typeof version === 'number' ? `Saved the grouping (version ${version})` : 'Saved the grouping';
      return { text: str(p['from_status']) ? `${saved}; the plan was dropped` : saved, tone: 'neutral' };
    }
    case 'registry_url_set':
      return { text: `Set the registry URL of ${str(p['origin']) ?? '?'} to ${str(p['url']) ?? '?'}`, tone: 'accent' };
    case 'exposure_cancelled':
      return { text: 'Cancelled the exposure', tone: 'muted' };
    case 'plan_requested':
      return { text: 'Requested a plan', tone: 'accent' };
    case 'plan_ready': {
      const s = p['summary'] as { add?: number; change?: number; destroy?: number } | undefined;
      return { text: s ? `Planned: +${s.add ?? 0} ~${s.change ?? 0} −${s.destroy ?? 0} on the F5` : 'Planned', tone: 'ok' };
    }
    case 'plan_confirmed':
      return { text: 'Confirmed the plan; deploying', tone: 'ok' };
    case 'planning_failed':
    case 'deploying_failed':
    case 'cancelling_failed':
      return { text: `${event.type.split('_')[0].replace(/^./, (c) => c.toUpperCase())} failed at ${str(p['step']) ?? '?'}: ${str(p['message']) ?? ''}`, tone: 'danger' };
    case 'retry_requested':
      return { text: `Retried ${str(p['phase']) ?? ''}`, tone: 'accent' };
    case 'cancel_requested':
      return { text: 'Asked to cancel; the agent is releasing what the exposure holds', tone: 'muted' };
    case 'supersede_requested': {
      const by = str(p['by']);
      return { text: 'Superseded by a newer submission; the agent is releasing what it holds', tone: 'muted', link: by ? { prefix: '', exposureId: by } : undefined };
    }
    case 'agent_step': {
      const step = str(p['step']) ?? '?';
      const message = str(p['message']);
      return {
        text: `${step} ${str(p['state']) ?? ''}${message ? ': ' + message : ''}`,
        tone: p['state'] === 'failed' ? 'danger' : p['state'] === 'done' ? 'ok' : 'neutral'
      };
    }
    case 'origins_registered': {
      const registered = Array.isArray(p['registered']) ? p['registered'].length : 0;
      const already = Array.isArray(p['already_registered']) ? p['already_registered'].length : 0;
      const text = `Registered ${registered} origin${registered === 1 ? '' : 's'} as published`;
      return { text: already ? `${text}; ${already} already were, by someone else` : text, tone: 'ok' };
    }
    case 'exposure_deployed': {
      const url = str(p['public_url']);
      return { text: url ? `Deployed; the app is live at ${url}` : 'Deployed', tone: 'ok' };
    }
    case 'grouping_pruned': {
      const origins = Array.isArray(p['origins']) ? p['origins'].join(', ') : 'Some services';
      const by = str(p['by']);
      return {
        text: `${origins} left the grouping${str(p['from_status']) ? ', and the plan was dropped' : ''}, published by`,
        tone: 'muted',
        link: by ? { prefix: '', exposureId: by } : undefined
      };
    }
    case 'earlier_exposure_deployed': {
      const by = str(p['by']);
      return {
        text: 'An earlier submission of this app deployed; planning is unblocked',
        tone: 'accent',
        link: by ? { prefix: '', exposureId: by } : undefined
      };
    }
    default: {
      const name = event.type.replace(/_/g, ' ');
      return { text: name.charAt(0).toUpperCase() + name.slice(1), tone: 'neutral' };
    }
  }
}
