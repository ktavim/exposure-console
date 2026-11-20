import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output } from '@angular/core';
import { CircleDashed, LucideAngularModule, Plus, X } from 'lucide-angular';
import type { ExposureDetail, ExposureService } from '@core/models';
import type { GroupingDraft } from '@lib/grouping-draft';
import { ServiceCardComponent } from './service-card.component';

/** A move the board asks for: into a group by key, out of every group (null), or into a new group. */
export interface MoveRequest {
  serviceId: string;
  to: string | null | 'new';
  index?: number;
}

interface Column {
  key: string;
  number: number;
  hosts: string;
  services: ExposureService[];
  blocked: boolean;
}

const NEW = 'new';
const NONE = '__none';

/**
 * The VIP groups as columns of service cards. Moves go out as events; the
 * workspace owns the draft. A card moves by drag and drop, or from the
 * keyboard: focus it and press 1 to 9 for that VIP, N for a new one, 0 to take
 * it out of its group.
 */
@Component({
  selector: 'app-grouping-board',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, LucideAngularModule, ServiceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      cdkDropListGroup
      class="grid auto-cols-[minmax(260px,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-2"
      [class.max-w-md]="only()"
    >
      @if (!only() && ungrouped().length) {
        <div
          cdkDropList
          [cdkDropListData]="NONE"
          [cdkDropListDisabled]="!editable()"
          (cdkDropListDropped)="dropped($event)"
          class="min-h-44 rounded-xl border border-dashed border-danger bg-surface-2 p-2.5"
          role="group"
          aria-label="Not grouped"
        >
          <h3 class="mx-1 mb-2.5 mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-danger">
            <lucide-icon [img]="icons.CircleDashed" [size]="15" aria-hidden="true" />Not grouped
            <span class="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-xs font-medium text-white">{{ ungrouped().length }}</span>
          </h3>
          @for (s of ungrouped(); track s.id) {
            <app-service-card
              cdkDrag
              [cdkDragData]="s.id"
              [cdkDragDisabled]="!editable()"
              [service]="s"
              [editable]="editable()"
              [errors]="errorsOf(s.id)"
              [attr.aria-keyshortcuts]="editable() ? '1 2 3 4 5 6 7 8 9 N 0' : null"
              [attr.aria-describedby]="editable() ? 'card-keys' : null"
              (keydown)="key($event, s.id)"
            >
              <div *cdkDragPlaceholder class="mb-2 h-16 rounded-lg border-2 border-dashed border-accent-line bg-accent-bg"></div>
            </app-service-card>
          }
        </div>
      }

      @for (c of shown(); track c.key) {
        <div
          cdkDropList
          [cdkDropListData]="c.key"
          [cdkDropListDisabled]="!editable()"
          (cdkDropListDropped)="dropped($event)"
          class="min-h-44 rounded-xl border border-border bg-surface-2 p-2.5 transition-colors"
          role="group"
          [attr.aria-label]="'VIP ' + c.number + (c.hosts ? ' · ' + c.hosts : '')"
        >
          <h3 class="mx-1 mb-2.5 mt-0.5 flex items-center gap-2 text-[13px] font-semibold">
            <span [class]="vipBadge(c.blocked)" aria-hidden="true">{{ c.number }}</span>
            <span class="flex-1 truncate">VIP {{ c.number }}@if (c.hosts) {<span class="font-normal text-fg-muted"> · {{ c.hosts }}</span>}</span>
            <span class="min-w-5 rounded-full bg-border-soft px-1.5 text-center text-xs font-medium tabular-nums text-fg-muted">{{ c.services.length }}</span>
            @if (editable() && c.services.length === 0) {
              <button
                type="button"
                class="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-border-soft hover:text-fg"
                [attr.aria-label]="'Remove VIP ' + c.number"
                title="Remove this empty VIP"
                (click)="removed.emit(c.key)"
              >
                <lucide-icon [img]="icons.X" [size]="14" aria-hidden="true" />
              </button>
            }
          </h3>
          @for (s of c.services; track s.id) {
            <app-service-card
              cdkDrag
              [cdkDragData]="s.id"
              [cdkDragDisabled]="!editable()"
              [service]="s"
              [editable]="editable()"
              [errors]="errorsOf(s.id)"
              [attr.aria-keyshortcuts]="editable() ? '1 2 3 4 5 6 7 8 9 N 0' : null"
              [attr.aria-describedby]="editable() ? 'card-keys' : null"
              (keydown)="key($event, s.id)"
            >
              <div *cdkDragPlaceholder class="mb-2 h-16 rounded-lg border-2 border-dashed border-accent-line bg-accent-bg"></div>
            </app-service-card>
          } @empty {
            <p class="grid h-24 place-items-center rounded-lg border border-dashed border-border text-[13px] text-fg-subtle">
              {{ editable() ? 'Drop a service here' : 'No services' }}
            </p>
          }
        </div>
      }

      @if (editable() && !only()) {
        <div
          cdkDropList
          [cdkDropListData]="NEW"
          (cdkDropListDropped)="dropped($event)"
          class="grid min-h-44 place-items-center rounded-xl border border-dashed border-border p-2.5 text-fg-subtle"
        >
          <button
            type="button"
            class="flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 text-[13px] hover:bg-surface-2 hover:text-fg"
            (click)="added.emit()"
          >
            <lucide-icon [img]="icons.Plus" [size]="18" aria-hidden="true" />
            New VIP
            <span class="text-xs">or drop a service here</span>
          </button>
        </div>
      }
    </div>


    <p id="card-keys" class="sr-only">Press 1 to 9 to move to that VIP, N for a new VIP, 0 to take it out of its group.</p>
  `,
  styles: [`
    .cdk-drag-preview { box-shadow: 0 8px 24px rgb(31 35 40 / 0.18); border-radius: 0.5rem; }
    .cdk-drag-animating, .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
    .cdk-drop-list-receiving { border-color: var(--color-accent); }
  `]
})
export class GroupingBoardComponent {
  readonly exposure = input.required<ExposureDetail>();
  readonly draft = input.required<GroupingDraft>();
  readonly editable = input(false);
  /** The key of the one group to show; all of them when null. */
  readonly only = input<string | null>(null);
  /** Errors the server gave for a refused save, by service id. */
  readonly errors = input<Record<string, string[]>>({});

  readonly moved = output<MoveRequest>();
  readonly removed = output<string>();
  /** An empty VIP added from the board's own button. */
  readonly added = output<void>();

  protected readonly NEW = NEW;
  protected readonly NONE = NONE;
  protected readonly icons = { CircleDashed, Plus, X };

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  private readonly byId = computed(() => new Map(this.exposure().services.map((s) => [s.id, s])));
  /** Saved blockers about one service, except "not in a group": the draft decides that. */
  private readonly blockedIds = computed(
    () => new Set(this.exposure().blocked_by.filter((n) => n.service_id && n.code !== 'service_ungrouped').map((n) => n.service_id))
  );

  protected readonly columns = computed<Column[]>(() =>
    this.draft().groups.map((g, i) => {
      const services = g.serviceIds.map((id) => this.byId().get(id)).filter((s): s is ExposureService => !!s);
      return {
        key: g.key,
        number: i + 1,
        hosts: [...new Set(services.map((s) => s.host.split('.')[0]))].join(', '),
        services,
        blocked: services.some((s) => this.blockedIds().has(s.id) || (this.errors()[s.id]?.length ?? 0) > 0)
      };
    })
  );
  protected readonly shown = computed(() => {
    const only = this.only();
    return only ? this.columns().filter((c) => c.key === only) : this.columns();
  });
  protected readonly ungrouped = computed(() =>
    this.draft().ungrouped.map((id) => this.byId().get(id)).filter((s): s is ExposureService => !!s)
  );

  /** A card's blockers as saved, and the errors of a refused save. */
  protected errorsOf(serviceId: string): string[] {
    const saved = this.exposure()
      .blocked_by.filter((n) => n.service_id === serviceId && n.code !== 'service_ungrouped')
      .map((n) => n.message);
    return [...saved, ...(this.errors()[serviceId] ?? [])];
  }

  protected dropped(event: CdkDragDrop<string>): void {
    const serviceId = event.item.data as string;
    const target = event.container.data;
    if (target === NEW) this.moved.emit({ serviceId, to: 'new' });
    else this.moved.emit({ serviceId, to: target === NONE ? null : target, index: event.currentIndex });
  }

  protected key(event: KeyboardEvent, serviceId: string): void {
    if (!this.editable() || event.ctrlKey || event.metaKey || event.altKey) return;
    let to: string | null | 'new' | undefined;
    if (event.key === 'n' || event.key === 'N') to = 'new';
    else if (event.key === '0') to = null;
    else if (/^[1-9]$/.test(event.key)) to = this.columns()[Number(event.key) - 1]?.key;
    if (to === undefined) return;
    event.preventDefault();
    this.moved.emit({ serviceId, to });
    // The card is rendered anew in its new column; keep the keyboard on it.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-service-id="${serviceId}"]`)?.focus(),
      { injector: this.injector }
    );
  }


  protected vipBadge(blocked: boolean): string {
    return (
      'grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ring-1 ring-inset ' +
      (blocked ? 'bg-danger-bg text-danger ring-danger-line' : 'bg-surface text-fg-muted ring-border')
    );
  }

}
