import type { ExposureStatus } from '@core/models';

/** How a status reads at a glance. Colour is never the only cue: each has a label and an icon. */
export type StatusTone = 'neutral' | 'progress' | 'attention' | 'success' | 'danger' | 'muted';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  /** A lucide icon name, for StatusBadgeComponent. */
  icon: StatusIcon;
}

export type StatusIcon =
  | 'layers'
  | 'loader'
  | 'clipboard-check'
  | 'rocket'
  | 'circle-check'
  | 'circle-x'
  | 'undo'
  | 'ban'
  | 'arrow-right-left';

/**
 * One label, tone and icon per lifecycle status, used everywhere a status
 * appears. Provisional: docs/exposure-console-ui.md, Status presentation,
 * is where the final choice is recorded.
 */
export const STATUS: Record<ExposureStatus, StatusPresentation> = {
  grouping: { label: 'Grouping', tone: 'neutral', icon: 'layers' },
  planning: { label: 'Planning', tone: 'progress', icon: 'loader' },
  awaiting_confirmation: { label: 'Awaiting confirmation', tone: 'attention', icon: 'clipboard-check' },
  deploying: { label: 'Deploying', tone: 'progress', icon: 'rocket' },
  deployed: { label: 'Deployed', tone: 'success', icon: 'circle-check' },
  failed: { label: 'Failed', tone: 'danger', icon: 'circle-x' },
  cancelling: { label: 'Cancelling', tone: 'progress', icon: 'undo' },
  cancelled: { label: 'Cancelled', tone: 'muted', icon: 'ban' },
  superseded: { label: 'Superseded', tone: 'muted', icon: 'arrow-right-left' }
};
