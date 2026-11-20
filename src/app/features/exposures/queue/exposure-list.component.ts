import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChevronRight, CircleCheck, History, Inbox, ListTodo, LucideAngularModule, OctagonAlert } from 'lucide-angular';
import { StatusBadgeComponent } from '@shared/status-badge.component';
import { type ExposureList, useExposureListQuery } from '../data/exposures.queries';

/** The queue (open exposures, oldest submission first) or the history (closed ones, newest first). */
@Component({
  selector: 'app-exposure-list',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mx-auto max-w-6xl px-6 py-8' },
  template: `
    <header class="mb-5 flex items-end gap-3">
      <span class="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
        <lucide-icon [img]="isQueue() ? icons.ListTodo : icons.History" [size]="18" aria-hidden="true" />
      </span>
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {{ isQueue() ? 'Queue' : 'History' }}
          @if (query.data(); as rows) {
            <span class="rounded-full bg-border-soft px-2 text-xs font-medium text-fg-muted tabular-nums">{{ rows.length }}</span>
          }
        </h1>
        <p class="text-[13px] text-fg-muted">
          @if (isQueue()) {
            Submitted apps waiting to be published through the F5, oldest submission first.
          } @else {
            Exposures that were deployed, cancelled or superseded, newest first.
          }
        </p>
      </div>
    </header>

    @if (query.isPending()) {
      <div class="overflow-hidden rounded-xl border border-border bg-surface shadow-card" role="status" aria-label="Loading">
        @for (row of [1, 2, 3]; track row) {
          <div class="flex items-center gap-3 border-t border-border-soft px-4 py-3.5 first:border-t-0">
            <div class="size-8 animate-pulse rounded-lg bg-border-soft"></div>
            <div class="flex-1 space-y-1.5">
              <div class="h-3 w-40 animate-pulse rounded bg-border-soft"></div>
              <div class="h-2.5 w-56 animate-pulse rounded bg-border-soft"></div>
            </div>
          </div>
        }
      </div>
    } @else if (query.isError()) {
      <p class="flex items-center gap-2 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-danger" role="alert">
        <lucide-icon [img]="icons.OctagonAlert" [size]="16" aria-hidden="true" />
        Could not load the exposures: {{ query.error().message }}
      </p>
    } @else if (query.data()?.length === 0) {
      <div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <span class="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
          <lucide-icon [img]="icons.Inbox" [size]="20" aria-hidden="true" />
        </span>
        <p class="font-medium">{{ isQueue() ? 'Nothing waiting' : 'No closed exposures yet' }}</p>
        <p class="text-[13px] text-fg-muted">
          {{ isQueue() ? 'Apps appear here as soon as they are submitted.' : 'Deployed, cancelled and superseded exposures appear here.' }}
        </p>
      </div>
    } @else {
      <div class="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table class="w-full text-left">
          <thead class="border-b border-border bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th scope="col" class="py-2.5 pl-4 pr-3 font-medium">App</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Submitted</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">Need a VIP</th>
              @if (isQueue()) {
                <th scope="col" class="px-3 py-2.5 font-medium">Planning</th>
              }
              <th scope="col" class="w-10"><span class="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (e of query.data(); track e.id) {
              <tr class="group border-t border-border-soft transition-colors first:border-t-0 hover:bg-surface-2">
                <td class="py-3 pl-4 pr-3">
                  <div class="flex items-center gap-3">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-bg text-[13px] font-semibold text-accent" aria-hidden="true">
                      {{ e.app.name.charAt(0) }}
                    </span>
                    <div class="min-w-0">
                      <a [routerLink]="['/exposures', e.id]" class="font-medium text-fg after:absolute after:inset-0 hover:text-accent">{{ e.app.name }}</a>
                      <div class="truncate font-mono text-xs text-fg-subtle">{{ e.app.url }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-3">
                  <div class="tabular-nums">{{ e.submitted_at | date: 'MMM d, y · HH:mm' }}</div>
                  <div class="text-xs text-fg-subtle">by {{ e.submitted_by }}</div>
                </td>
                <td class="px-3 py-3"><app-status-badge [status]="e.status" /></td>
                <td class="px-3 py-3 text-right">
                  <span class="inline-block min-w-7 rounded-md bg-surface-2 px-1.5 py-0.5 text-center font-medium tabular-nums">{{ e.needs_vip_count }}</span>
                </td>
                @if (isQueue()) {
                  <td class="px-3 py-3">
                    @if (e.blocked) {
                      <span class="inline-flex items-center gap-1.5 font-medium text-danger">
                        <lucide-icon [img]="icons.OctagonAlert" [size]="14" aria-hidden="true" />Blocked
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1.5 text-ok">
                        <lucide-icon [img]="icons.CircleCheck" [size]="14" aria-hidden="true" />Ready
                      </span>
                    }
                  </td>
                }
                <td class="pr-3 text-fg-subtle">
                  <lucide-icon [img]="icons.ChevronRight" [size]="16" class="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    /* The app link covers its row, so the whole row opens the exposure. */
    tr { position: relative; }
  `]
})
export class ExposureListComponent {
  /** From the route's data. */
  readonly list = input<ExposureList>('queue');
  protected readonly query = useExposureListQuery(this.list);
  protected readonly isQueue = computed(() => this.list() === 'queue');
  protected readonly icons = { ChevronRight, CircleCheck, History, Inbox, ListTodo, OctagonAlert };
}
