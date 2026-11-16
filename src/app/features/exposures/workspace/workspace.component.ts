import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ExposureDetail, ExposureNotice, ExposureService } from '@core/models';
import { formatOrigin } from '@lib/origin';
import { StatusBadgeComponent } from '@shared/status-badge.component';
import { useExposureQuery } from '../data/exposures.queries';

/** What the right pane shows: all the groups, one of them, or a section. */
type View = 'board' | 'blocked' | 'published' | 'excluded' | `group:${string}`;

interface GroupView {
  id: string;
  label: string;
  services: ExposureService[];
  blocked: boolean;
}

/**
 * One exposure, master and detail (docs/exposure-console-ui.md, Grouping):
 * the left pane lists the groups and sections, the right pane shows the one
 * selected. Read-only for now; moving services between groups is phase 3.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full' },
  template: `
    @if (query.isPending()) {
      <p class="p-6 text-fg-muted" role="status">Loading…</p>
    } @else if (query.isError()) {
      <p class="p-6 text-danger" role="alert">Could not load the exposure: {{ query.error().message }}</p>
    } @else if (exposure(); as e) {
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
        <h1 class="text-lg font-semibold">{{ e.app.name }}</h1>
        <app-status-badge [status]="e.status" />
        <span class="font-mono text-[12.5px]">{{ e.app.url ?? 'no URL' }}</span>
        <span class="text-[13px] text-fg-muted">
          v{{ e.version }} · submitted {{ e.submitted_at | date: 'medium' }} by {{ e.submitted_by }}
          @if (e.supersedes) {
            · replaces <a [routerLink]="['/exposures', e.supersedes]" class="font-mono text-accent hover:underline">{{ e.supersedes }}</a>
          }
          @if (e.superseded_by) {
            · replaced by <a [routerLink]="['/exposures', e.superseded_by]" class="font-mono text-accent hover:underline">{{ e.superseded_by }}</a>
          }
        </span>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
        <aside class="overflow-auto border-r border-border bg-side px-2 py-3" aria-label="Exposure sections">
          <button type="button" [class]="item('board')" [attr.aria-current]="view() === 'board'" (click)="view.set('board')">
            <span class="flex-1">All VIP groups</span><span [class]="count(false)">{{ groups().length }}</span>
          </button>
          <button type="button" [class]="item('blocked')" [attr.aria-current]="view() === 'blocked'" (click)="view.set('blocked')">
            <span class="flex-1">What blocks planning</span><span [class]="count(e.blocked_by.length > 0)">{{ e.blocked_by.length }}</span>
          </button>

          <h3 [class]="heading">Groups</h3>
          @for (g of groups(); track g.id) {
            <button type="button" [class]="item(groupView(g.id))" [attr.aria-current]="view() === groupView(g.id)" (click)="view.set(groupView(g.id))">
              <span [class]="dot(g.blocked ? 'danger' : 'ok')" [attr.aria-label]="g.blocked ? 'blocked' : 'ready'"></span>
              <span class="flex-1 truncate">{{ g.label }}</span><span [class]="count(false)">{{ g.services.length }}</span>
            </button>
          }
          @if (ungrouped().length) {
            <button type="button" [class]="item('none')" (click)="view.set('board')">
              <span [class]="dot('danger')" aria-label="blocked"></span>
              <span class="flex-1">Not grouped</span><span [class]="count(true)">{{ ungrouped().length }}</span>
            </button>
          }

          <h3 [class]="heading">Read only</h3>
          <button type="button" [class]="item('published')" [attr.aria-current]="view() === 'published'" (click)="view.set('published')">
            <span [class]="dot(publishedBlocked() ? 'danger' : 'subtle')" [attr.aria-label]="publishedBlocked() ? 'blocked' : null"></span>
            <span class="flex-1">Already published</span><span [class]="count(false)">{{ published().length }}</span>
          </button>
          <button type="button" [class]="item('excluded')" [attr.aria-current]="view() === 'excluded'" (click)="view.set('excluded')">
            <span [class]="dot('subtle')"></span>
            <span class="flex-1">Excluded</span><span [class]="count(false)">{{ excluded().length }}</span>
          </button>
        </aside>

        <section class="overflow-auto px-6 pb-10 pt-5" [attr.aria-labelledby]="'detail-heading'">
          @switch (view()) {
            @case ('blocked') {
              <h2 id="detail-heading" class="text-base font-semibold">What blocks planning</h2>
              <p class="mb-4 text-fg-muted">Fixed here, or on a new scan.</p>
              @if (e.blocked_by.length) {
                <ul class="overflow-hidden rounded-lg border border-border">
                  @for (n of e.blocked_by; track $index) {
                    <li class="flex items-start gap-2.5 border-t border-border-soft px-3 py-2 first:border-t-0">
                      <span [class]="dot('danger')" class="mt-1.5" aria-hidden="true"></span>{{ n.message }}
                    </li>
                  }
                </ul>
              } @else {
                <p>Nothing. A plan can be requested.</p>
              }
            }
            @case ('published') {
              <h2 id="detail-heading" class="text-base font-semibold">Already published</h2>
              <p class="mb-4 text-fg-muted">No VIP. The app's rewrite map points them at their registry URL.</p>
              <table [class]="table">
                <thead><tr><th [class]="th">Origin</th><th [class]="th">Rewritten to</th><th [class]="th">Registry note</th></tr></thead>
                <tbody>
                  @for (s of published(); track s.id) {
                    <tr>
                      <td [class]="td" class="font-mono text-[12.5px]">{{ origin(s) }}</td>
                      <td [class]="td" class="font-mono text-[12.5px]">
                        @if (s.scope === 'unresolved') {
                          <span [class]="pill('danger')">registry entry removed</span>
                        } @else if (s.registry_entry?.url) {
                          {{ s.registry_entry?.url }}
                        } @else {
                          <span [class]="pill('danger')">no URL</span>
                        }
                      </td>
                      <td [class]="td" class="text-fg-subtle">{{ s.registry_entry?.note }}</td>
                    </tr>
                  } @empty {
                    <tr><td [class]="td" colspan="3" class="text-fg-subtle">None.</td></tr>
                  }
                </tbody>
              </table>
            }
            @case ('excluded') {
              <h2 id="detail-heading" class="text-base font-semibold">Excluded</h2>
              <p class="mb-4 text-fg-muted">Excluded on the scan; out of scope.</p>
              <table [class]="table">
                <tbody>
                  @for (s of excluded(); track s.id) {
                    <tr>
                      <td [class]="td" class="font-mono text-[12.5px]">{{ origin(s) }}</td>
                      <td [class]="td" class="text-fg-subtle">{{ s.auth_method }}</td>
                    </tr>
                  } @empty {
                    <tr><td [class]="td" class="text-fg-subtle">None.</td></tr>
                  }
                </tbody>
              </table>
            }
            @default {
              <h2 id="detail-heading" class="text-base font-semibold">{{ selectedGroup()?.label ?? 'VIP groups' }}</h2>
              <p class="mb-4 text-fg-muted">Services in one group share a VIP: one IP, HTTPS on 443.</p>
              @if (appBlockers().length) {
                <ul class="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-danger">
                  @for (n of appBlockers(); track $index) {
                    <li>{{ n.message }}</li>
                  }
                </ul>
              }
              <div class="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2" [class.max-w-sm]="selectedGroup()">
                @if (!selectedGroup() && ungrouped().length) {
                  <div class="min-h-40 rounded-lg border border-danger bg-surface-2 p-2" role="group" aria-label="Not grouped">
                    <h3 class="mx-1 mb-2 mt-0.5 text-[13px] font-semibold text-danger">Not grouped</h3>
                    @for (s of ungrouped(); track s.id) {
                      <ng-container *ngTemplateOutlet="card; context: { $implicit: s }" />
                    }
                  </div>
                }
                @for (g of shownGroups(); track g.id) {
                  <div class="min-h-40 rounded-lg border border-border bg-surface-2 p-2" role="group" [attr.aria-label]="g.label">
                    <h3 class="mx-1 mb-2 mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold">
                      {{ g.label }} <span [class]="count(false)">{{ g.services.length }}</span>
                    </h3>
                    @for (s of g.services; track s.id) {
                      <ng-container *ngTemplateOutlet="card; context: { $implicit: s }" />
                    } @empty {
                      <p class="mx-1 text-fg-subtle">Empty</p>
                    }
                  </div>
                }
              </div>
            }
          }
        </section>
      </div>

      <ng-template #card let-s>
        <article class="mb-2 rounded-md border border-border bg-surface px-2.5 py-2" [attr.aria-label]="origin(s)">
          <div class="break-all font-mono text-xs">{{ origin(s) }}</div>
          <div class="mt-0.5 text-xs text-fg-muted">
            {{ s.auth_method }} · {{ members(s) }} · {{ s.found_by.join('+') }}
          </div>
          @for (n of blockersOf(e, s); track $index) {
            <p class="mt-1.5 rounded bg-danger-bg px-1.5 py-1 text-xs text-danger">{{ n.message }}</p>
          }
          @for (n of s.warnings; track $index) {
            <p class="mt-1.5 rounded bg-warn-bg px-1.5 py-1 text-xs text-warn">{{ n.message }}</p>
          }
        </article>
      </ng-template>
    }
  `
})
export class WorkspaceComponent {
  /** The route's :id. */
  readonly id = input.required<string>();
  protected readonly query = useExposureQuery(this.id);
  protected readonly exposure = computed(() => this.query.data());
  protected readonly view = signal<View>('board');

  private readonly blockedServices = computed(
    () => new Set((this.exposure()?.blocked_by ?? []).map((n) => n.service_id).filter((id) => id !== null))
  );

  protected readonly groups = computed<GroupView[]>(() => {
    const e = this.exposure();
    if (!e) return [];
    const byId = new Map(e.services.map((s) => [s.id, s]));
    return e.groups.map((g, i) => {
      const services = g.service_ids.map((id) => byId.get(id)).filter((s): s is ExposureService => !!s);
      const hosts = [...new Set(services.map((s) => s.host.split('.')[0]))];
      return {
        id: g.id,
        label: hosts.length ? `VIP ${i + 1} · ${hosts.join(', ')}` : `VIP ${i + 1}`,
        services,
        blocked: services.some((s) => this.blockedServices().has(s.id))
      };
    });
  });

  protected readonly selectedGroup = computed(() => {
    const view = this.view();
    return view.startsWith('group:') ? this.groups().find((g) => `group:${g.id}` === view) : undefined;
  });
  protected readonly shownGroups = computed(() => {
    const selected = this.selectedGroup();
    return selected ? [selected] : this.groups();
  });

  protected readonly ungrouped = computed(
    () => this.exposure()?.services.filter((s) => s.scope === 'needs_vip' && !s.group_id) ?? []
  );
  protected readonly published = computed(
    () => this.exposure()?.services.filter((s) => s.scope === 'published' || s.scope === 'unresolved') ?? []
  );
  protected readonly publishedBlocked = computed(() => this.published().some((s) => this.blockedServices().has(s.id)));
  protected readonly excluded = computed(() => this.exposure()?.services.filter((s) => s.scope === 'excluded') ?? []);
  /** Blockers about the whole exposure, which no card shows. */
  protected readonly appBlockers = computed(() => this.exposure()?.blocked_by.filter((n) => !n.service_id) ?? []);

  protected readonly origin = formatOrigin;

  protected groupView(id: string): View {
    return `group:${id}`;
  }

  protected members(s: ExposureService): string {
    const n = s.ips?.length ?? 0;
    return n === 0 ? 'unresolved' : `${n} member${n === 1 ? '' : 's'}`;
  }

  protected blockersOf(e: ExposureDetail, s: ExposureService): ExposureNotice[] {
    return e.blocked_by.filter((n) => n.service_id === s.id);
  }

  // Shared classes, so the template reads as structure.
  protected readonly heading = 'mx-2 mb-1 mt-3.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle';
  protected readonly table = 'w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border text-left';
  protected readonly th = 'bg-surface-2 px-3 py-2 text-xs font-semibold text-fg-muted border-b border-border';
  protected readonly td = 'px-3 py-2 align-top [tr+tr>&]:border-t [tr+tr>&]:border-border-soft';

  protected item(view: string): string {
    const current = this.view() === view;
    return (
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-border-soft' +
      (current ? ' bg-accent-bg shadow-[inset_2px_0_var(--color-accent)]' : '')
    );
  }

  protected count(alert: boolean): string {
    return 'rounded-full px-1.5 text-xs ' + (alert ? 'bg-danger text-white' : 'bg-border-soft text-fg-muted');
  }

  protected dot(tone: 'danger' | 'ok' | 'subtle'): string {
    return 'inline-block size-2 shrink-0 rounded-full ' + { danger: 'bg-danger', ok: 'bg-ok', subtle: 'bg-fg-subtle' }[tone];
  }

  protected pill(tone: 'danger'): string {
    return 'rounded-full px-2 py-px font-sans text-xs font-medium ' + { danger: 'bg-danger-bg text-danger' }[tone];
  }
}
