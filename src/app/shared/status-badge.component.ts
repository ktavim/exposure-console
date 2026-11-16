import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ArrowRightLeft,
  Ban,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Layers,
  LoaderCircle,
  LucideAngularModule,
  Rocket,
  Undo2
} from 'lucide-angular';
import type { ExposureStatus } from '@core/models';
import { STATUS, type StatusIcon } from '@lib/status';

const ICONS = {
  layers: Layers,
  loader: LoaderCircle,
  'clipboard-check': ClipboardCheck,
  rocket: Rocket,
  'circle-check': CircleCheck,
  'circle-x': CircleX,
  undo: Undo2,
  ban: Ban,
  'arrow-right-left': ArrowRightLeft
} satisfies Record<StatusIcon, unknown>;

// A soft fill with a border of the same hue, so a badge holds its shape on either theme.
const TONE_CLASSES = {
  neutral: 'border-border bg-surface-2 text-fg-muted',
  progress: 'border-accent-line bg-accent-bg text-accent',
  attention: 'border-warn-line bg-warn-bg text-warn',
  success: 'border-ok-line bg-ok-bg text-ok',
  danger: 'border-danger-line bg-danger-bg text-danger',
  muted: 'border-border-soft bg-border-soft text-fg-subtle'
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap"
      [class]="toneClasses()"
    >
      <lucide-icon [img]="icon()" [size]="12" aria-hidden="true"></lucide-icon>
      {{ presentation().label }}
    </span>
  `
})
export class StatusBadgeComponent {
  readonly status = input.required<ExposureStatus>();
  protected readonly presentation = computed(() => STATUS[this.status()]);
  protected readonly icon = computed(() => ICONS[this.presentation().icon]);
  protected readonly toneClasses = computed(() => TONE_CLASSES[this.presentation().tone]);
}
