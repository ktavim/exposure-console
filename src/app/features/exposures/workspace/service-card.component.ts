import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GripVertical, KeyRound, LucideAngularModule, OctagonAlert, Server, TriangleAlert } from 'lucide-angular';
import type { ExposureService } from '@core/models';
import { formatOrigin } from '@lib/origin';

/**
 * One service on the grouping board. The board puts cdkDrag on this element
 * itself, inside each column's drop list: a drag declared in a template
 * rendered elsewhere would not find the list around it.
 */
@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group mb-2 block rounded-lg border bg-surface px-3 py-2.5 shadow-card transition-shadow last:mb-0 hover:shadow-raised',
    '[class.border-danger]': 'errors().length > 0',
    '[class.border-border]': 'errors().length === 0',
    '[class.cursor-grab]': 'editable()',
    role: 'article',
    tabindex: '0',
    '[attr.aria-label]': 'origin()',
    '[attr.data-service-id]': 'service().id'
  },
  template: `
    <div class="flex items-start gap-1.5">
      <div class="flex-1 break-all font-mono text-[12.5px] font-medium">{{ origin() }}</div>
      @if (editable()) {
        <lucide-icon [img]="icons.GripVertical" [size]="14" class="mt-0.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      }
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span [class]="authPill()"><lucide-icon [img]="icons.KeyRound" [size]="11" aria-hidden="true" />{{ service().auth_method }}</span>
      <span class="inline-flex items-center gap-1 text-fg-muted" [title]="service().ips?.join(', ') ?? ''">
        <lucide-icon [img]="icons.Server" [size]="12" aria-hidden="true" />{{ members() }}
      </span>
      <span class="ml-auto flex gap-1">
        @for (scanner of service().found_by; track scanner) {
          <span class="rounded border border-border px-1 text-[11px] text-fg-subtle">{{ scanner }}</span>
        }
      </span>
    </div>
    @for (message of errors(); track $index) {
      <p class="mt-2 flex gap-1.5 rounded-md border-l-2 border-danger bg-danger-bg px-2 py-1.5 text-xs leading-relaxed text-danger">
        <lucide-icon [img]="icons.OctagonAlert" [size]="13" class="mt-px shrink-0" aria-hidden="true" />{{ message }}
      </p>
    }
    @for (n of service().warnings; track $index) {
      <p class="mt-2 flex gap-1.5 rounded-md border-l-2 border-warn bg-warn-bg px-2 py-1.5 text-xs leading-relaxed text-warn">
        <lucide-icon [img]="icons.TriangleAlert" [size]="13" class="mt-px shrink-0" aria-hidden="true" />{{ n.message }}
      </p>
    }
    <ng-content />
  `
})
export class ServiceCardComponent {
  readonly service = input.required<ExposureService>();
  readonly editable = input(false);
  /** Blockers and refused-save errors about this service. */
  readonly errors = input<string[]>([]);

  protected readonly icons = { GripVertical, KeyRound, OctagonAlert, Server, TriangleAlert };

  protected origin(): string {
    return formatOrigin(this.service());
  }

  protected members(): string {
    const n = this.service().ips?.length ?? 0;
    return n === 0 ? 'unresolved' : `${n} member${n === 1 ? '' : 's'}`;
  }

  /** Kerberos is flagged: v1 cannot publish it. */
  protected authPill(): string {
    return (
      'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-sans text-[11px] font-medium ' +
      (this.service().auth_method === 'kerberos'
        ? 'border-danger-line bg-danger-bg text-danger'
        : 'border-accent-line bg-accent-bg text-accent')
    );
  }
}
