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
    case 'app_url_set':
      return { text: `Set the app's URL to ${str(p['url']) ?? '?'}`, tone: 'accent' };
    case 'registry_url_set':
      return { text: `Set the registry URL of ${str(p['origin']) ?? '?'} to ${str(p['url']) ?? '?'}`, tone: 'accent' };
    case 'exposure_cancelled':
      return { text: 'Cancelled the exposure', tone: 'muted' };
    case 'exposure_deployed':
      return { text: 'Deployed', tone: 'ok' };
    default: {
      const name = event.type.replace(/_/g, ' ');
      return { text: name.charAt(0).toUpperCase() + name.slice(1), tone: 'neutral' };
    }
  }
}
