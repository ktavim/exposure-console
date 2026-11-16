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

const TONE_CLASSES = {
  neutral: 'border-border text-fg-muted',
  progress: 'border-transparent bg-accent-bg text-accent',
  attention: 'border-transparent bg-warn-bg text-warn',
  success: 'border-transparent bg-ok-bg text-ok',
  danger: 'border-transparent bg-danger-bg text-danger',
  muted: 'border-transparent bg-border-soft text-fg-subtle'
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium whitespace-nowrap border"
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
