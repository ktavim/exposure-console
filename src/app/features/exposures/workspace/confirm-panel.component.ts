import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideAngularModule, TriangleAlert, X } from 'lucide-angular';
import type { ExposureDetail } from '@core/models';
import { formatOrigin } from '@lib/origin';

/** Every app gets this: the scan cannot tell whether the app loads bundles with Subresource Integrity. */
const SRI = 'Bundles loaded with Subresource Integrity fail their hash once rewritten. The scan cannot tell whether this app uses it.';

/**
 * The deploy confirmation (docs/exposure-console-ui.md, Destructive actions):
 * a side panel saying what deploying does and that it cannot be stopped,
 * with a checkbox for each warning; Deploy is enabled once all are ticked.
 */
@Component({
  selector: 'app-confirm-panel',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-40 bg-black/30" aria-hidden="true" (click)="closed.emit()"></div>
    <div
      class="fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-full flex-col border-l border-border bg-surface shadow-raised"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      (keydown.escape)="closed.emit()"
    >
      <div class="flex items-center border-b border-border px-5 py-4">
        <h2 id="confirm-title" class="flex-1 text-lg font-semibold tracking-tight">Deploy {{ exposure().app.name }}</h2>
        <button type="button" class="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-border-soft" aria-label="Close" (click)="closed.emit()">
          <lucide-icon [img]="icons.X" [size]="16" aria-hidden="true" />
        </button>
      </div>
      <div class="flex-1 overflow-auto px-5 py-4 text-[13px]">
        @if (exposure().plan; as plan) {
          <ol class="list-decimal space-y-1.5 pl-5">
            <li>Dry-run again; stop if the F5 changed since the plan.</li>
            <li>
              Post the declaration to <span class="font-mono">{{ plan.partition }}</span>:
              <b class="text-ok">+{{ plan.summary.add }}</b> <b class="text-warn">~{{ plan.summary.change }}</b> −{{ plan.summary.destroy }}.
            </li>
            <li>Verify each virtual server, its pool members, and the app's rewriting.</li>
            <li>Create {{ plan.summary.dns }} DNS records in the external zone.</li>
            <li>Register the published origins, for other apps' rewrite maps.</li>
          </ol>
        }
        <p class="mt-3 font-medium text-danger">A deploy in progress cannot be stopped.</p>

        <h3 class="mb-2 mt-5 text-[13px] font-semibold">Acknowledge each warning</h3>
        <div class="space-y-2">
          @for (w of warnings(); track $index) {
            <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-warn-line bg-warn-bg px-3 py-2.5 text-warn">
              <input type="checkbox" class="mt-0.5 accent-current" [checked]="acked().has($index)" (change)="toggle($index)" />
              <span>
                @if (w.origin) {
                  <span class="font-mono text-[12.5px]">{{ w.origin }}</span>:
                }
                {{ w.text }}
              </span>
            </label>
          }
        </div>
        @if (error()) {
          <p class="mt-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-danger" role="alert">
            <lucide-icon [img]="icons.TriangleAlert" [size]="14" class="mt-0.5 shrink-0" aria-hidden="true" />{{ error() }}
          </p>
        }
      </div>
      <div class="flex items-center gap-2 border-t border-border px-5 py-3">
        <span class="flex-1 text-xs text-fg-muted">Plan <span class="font-mono">{{ shortHash() }}</span></span>
        <button type="button" class="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-muted hover:bg-border-soft" (click)="closed.emit()">Back</button>
        <button
          type="button"
          class="rounded-md bg-danger px-3.5 py-1.5 text-[13px] font-medium text-white shadow-card disabled:opacity-50"
          [disabled]="!allAcked() || pending()"
          (click)="confirmed.emit()"
        >
          {{ pending() ? 'Confirming…' : 'Deploy to F5' }}
        </button>
      </div>
    </div>
  `
})
export class ConfirmPanelComponent {
  readonly exposure = input.required<ExposureDetail>();
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly closed = output<void>();

  protected readonly icons = { TriangleAlert, X };
  protected readonly acked = signal(new Set<number>());

  /** The warnings on the services the rewrite map covers, and the one every app gets. */
  protected readonly warnings = computed(() => {
    const e = this.exposure();
    const fromServices = e.services.flatMap((s) =>
      s.warnings.map((w) => ({ origin: formatOrigin(s), text: w.message }))
    );
    return [...fromServices, { origin: null, text: SRI }];
  });
  protected readonly allAcked = computed(() => this.acked().size === this.warnings().length);
  protected readonly shortHash = computed(() => (this.exposure().plan_hash ?? '').slice(0, 19) + '…');

  protected toggle(i: number): void {
    const next = new Set(this.acked());
    if (next.has(i)) next.delete(i);
    else next.add(i);
    this.acked.set(next);
  }
}
