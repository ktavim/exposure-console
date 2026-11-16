import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@shared/status-badge.component';
import { type ExposureList, useExposureListQuery } from '../data/exposures.queries';

/** The queue (open exposures, oldest submission first) or the history (closed ones, newest first). */
@Component({
  selector: 'app-exposure-list',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mx-auto max-w-6xl px-6 py-6' },
  template: `
    <h1 class="text-xl font-semibold mb-1">{{ list() === 'queue' ? 'Queue' : 'History' }}</h1>
    <p class="text-fg-muted mb-4">
      @if (list() === 'queue') {
        Submitted apps waiting to be published through the F5, oldest submission first.
      } @else {
        Exposures that were deployed, cancelled or superseded, newest first.
      }
    </p>

    @if (query.isPending()) {
      <p class="text-fg-muted" role="status">Loading…</p>
    } @else if (query.isError()) {
      <p class="text-danger" role="alert">Could not load the exposures: {{ query.error().message }}</p>
    } @else if (query.data()?.length === 0) {
      <p class="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-fg-muted">
        {{ list() === 'queue' ? 'Nothing waiting. Submitted apps appear here.' : 'No closed exposures yet.' }}
      </p>
    } @else {
      <table class="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border bg-surface text-left">
        <thead class="bg-surface-2 text-xs text-fg-muted">
          <tr>
            <th scope="col" class="px-3 py-2 font-semibold">App</th>
            <th scope="col" class="px-3 py-2 font-semibold">Submitted</th>
            <th scope="col" class="px-3 py-2 font-semibold">Status</th>
            <th scope="col" class="px-3 py-2 font-semibold text-right">Need a VIP</th>
            @if (list() === 'queue') {
              <th scope="col" class="px-3 py-2 font-semibold">Planning</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (e of query.data(); track e.id) {
            <tr class="hover:bg-surface-2 [&>td]:border-t [&>td]:border-border-soft">
              <td class="px-3 py-2">
                <a [routerLink]="['/exposures', e.id]" class="font-medium text-accent hover:underline">{{ e.app.name }}</a>
                <div class="text-xs text-fg-subtle font-mono">{{ e.app.url ?? 'no URL' }}</div>
              </td>
              <td class="px-3 py-2">
                {{ e.submitted_at | date: 'medium' }}
                <div class="text-xs text-fg-subtle">by {{ e.submitted_by }}</div>
              </td>
              <td class="px-3 py-2"><app-status-badge [status]="e.status" /></td>
              <td class="px-3 py-2 text-right tabular-nums">{{ e.needs_vip_count }}</td>
              @if (list() === 'queue') {
                <td class="px-3 py-2">
                  @if (e.blocked) {
                    <span class="inline-flex items-center gap-1.5 text-danger font-medium"><span class="size-2 rounded-full bg-danger" aria-hidden="true"></span>Blocked</span>
                  } @else {
                    <span class="inline-flex items-center gap-1.5 text-fg-muted"><span class="size-2 rounded-full bg-ok" aria-hidden="true"></span>Ready</span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `
})
export class ExposureListComponent {
  /** From the route's data. */
  readonly list = input<ExposureList>('queue');
  protected readonly query = useExposureListQuery(this.list);
}
