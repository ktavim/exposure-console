import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CircleCheck, CircleDashed, LoaderCircle, LucideAngularModule, OctagonAlert } from 'lucide-angular';
import type { StepProgress } from '@lib/agent-steps';

/**
 * The agent's steps for one phase, every step listed from the start
 * (docs/exposure-console-ui.md, Progress and failure): done, under way, failed, or still
 * to come. While the agent works it is a live status region; once a phase
 * failed it shows where it stopped.
 */
@Component({
  selector: 'app-agent-progress',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="working() ? 'rounded-xl border border-accent-line bg-accent-bg px-4 py-3' : 'rounded-xl border border-border bg-surface px-4 py-3 shadow-card'"
      [attr.role]="working() ? 'status' : 'group'"
      [attr.aria-label]="label()"
    >
      <p class="flex items-center gap-2 font-medium">
        @if (working()) {
          <lucide-icon [img]="icons.LoaderCircle" [size]="15" class="animate-spin text-accent" aria-hidden="true" />
        }
        {{ heading() }}
      </p>
      <ol class="mt-2.5 space-y-1.5 text-[13px]">
        @for (s of steps(); track s.step; let i = $index) {
          <li class="flex items-start gap-2.5" [attr.aria-label]="s.label + ': ' + stateText[s.state]">
            <span class="mt-px grid size-4 shrink-0 place-items-center">
              @switch (s.state) {
                @case ('done') {
                  <lucide-icon [img]="icons.CircleCheck" [size]="15" class="text-ok" aria-hidden="true" />
                }
                @case ('skipped') {
                  <lucide-icon [img]="icons.CircleCheck" [size]="15" class="text-fg-subtle" aria-hidden="true" />
                }
                @case ('failed') {
                  <lucide-icon [img]="icons.OctagonAlert" [size]="15" class="text-danger" aria-hidden="true" />
                }
                @case ('pending') {
                  <lucide-icon [img]="icons.CircleDashed" [size]="15" class="text-fg-subtle" aria-hidden="true" />
                }
                @default {
                  <lucide-icon [img]="icons.LoaderCircle" [size]="15" class="animate-spin text-accent" aria-hidden="true" />
                }
              }
            </span>
            <span class="flex-1">
              <span [class.text-fg-subtle]="s.state === 'pending'" [class.font-medium]="s.state === 'started' || s.state === 'failed'" [class.text-danger]="s.state === 'failed'">
                {{ s.label }}
              </span>
              @if (s.state === 'skipped') {
                <span class="text-fg-subtle"> · done in an earlier attempt</span>
              } @else if (s.message) {
                <span class="text-fg-muted"> · {{ s.message }}</span>
              }
            </span>
          </li>
        }
      </ol>
      <ng-content />
    </div>
  `
})
export class AgentProgressComponent {
  readonly steps = input.required<StepProgress[]>();
  readonly heading = input.required<string>();
  /** The agent is at work on it now. */
  readonly working = input(false);
  readonly label = input('Agent progress');

  protected readonly icons = { CircleCheck, CircleDashed, LoaderCircle, OctagonAlert };
  protected readonly stateText: Record<StepProgress['state'], string> = {
    pending: 'to do',
    started: 'under way',
    done: 'done',
    skipped: 'done earlier',
    failed: 'failed',
    info: 'under way'
  };
}
