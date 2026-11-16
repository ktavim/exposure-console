import { formatDate, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowLeft,
  ArrowRight,
  CircleDashed,
  Clock,
  EyeOff,
  GitCompareArrows,
  Globe,
  KeyRound,
  LayoutGrid,
  LucideAngularModule,
  OctagonAlert,
  Radar,
  Server,
  Share2,
  TriangleAlert,
  User
} from 'lucide-angular';
import type { ExposureDetail, ExposureNotice, ExposureService } from '@core/models';
import { formatOrigin } from '@lib/origin';
import { StatusBadgeComponent } from '@shared/status-badge.component';
import { useExposureQuery } from '../data/exposures.queries';

/** What the right pane shows: all the groups, one of them, or a section. */
type View = 'board' | 'blocked' | 'published' | 'excluded' | `group:${string}`;

interface GroupView {
  id: string;
  /** 1-based, as the admin reads it. */
  number: number;
  label: string;
  hosts: string;
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
  imports: [NgTemplateOutlet, RouterLink, StatusBadgeComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full' },
  template: `
    @if (query.isPending()) {
      <div class="border-b border-border px-6 py-5" role="status" aria-label="Loading">
        <div class="h-3 w-16 animate-pulse rounded bg-border-soft"></div>
        <div class="mt-3 h-6 w-56 animate-pulse rounded bg-border-soft"></div>
        <div class="mt-3 h-3 w-96 animate-pulse rounded bg-border-soft"></div>
      </div>
    } @else if (query.isError()) {
      <p class="m-6 flex items-center gap-2 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-danger" role="alert">
        <lucide-icon [img]="icons.OctagonAlert" [size]="16" aria-hidden="true" />
        Could not load the exposure: {{ query.error().message }}
      </p>
    } @else if (exposure(); as e) {
      <header class="border-b border-border px-6 pb-4 pt-3">
        <a routerLink="/" class="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          <lucide-icon [img]="icons.ArrowLeft" [size]="13" aria-hidden="true" />Queue
        </a>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <span class="grid size-9 place-items-center rounded-lg bg-accent-bg text-base font-semibold text-accent" aria-hidden="true">
            {{ e.app.name.charAt(0) }}
          </span>
          <h1 class="text-xl font-semibold tracking-tight">{{ e.app.name }}</h1>
          <app-status-badge [status]="e.status" />
          <span class="rounded-md border border-border px-1.5 text-xs font-medium tabular-nums text-fg-muted" title="Version">v{{ e.version }}</span>
        </div>
        <dl class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
          @for (m of meta(); track m.label) {
            <div class="flex items-center gap-1.5">
              <dt class="sr-only">{{ m.label }}</dt>
              <dd class="flex items-center gap-1.5" [class.font-mono]="m.mono" [class.text-[12.5px]]="m.mono" [class.text-danger]="m.danger" [title]="m.title ?? ''">
                <lucide-icon [img]="m.icon" [size]="14" class="text-fg-subtle" aria-hidden="true" />
                @if (m.link) {
                  <span>{{ m.prefix }} <a [routerLink]="['/exposures', m.link]" class="font-mono text-[12.5px] text-accent hover:underline">{{ m.link }}</a></span>
                } @else {
                  <span>{{ m.text }}</span>
                }
              </dd>
            </div>
          }
        </dl>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-[272px_1fr]">
        <aside class="overflow-auto border-r border-border bg-side px-3 py-4" aria-label="Exposure sections">
          <button type="button" [class]="item('board')" [attr.aria-current]="view() === 'board'" (click)="view.set('board')">
            <lucide-icon [img]="icons.LayoutGrid" [size]="15" class="text-fg-muted" aria-hidden="true" />
            <span class="flex-1">All VIP groups</span><span [class]="count(false)">{{ groups().length }}</span>
          </button>
          <button type="button" [class]="item('blocked')" [attr.aria-current]="view() === 'blocked'" (click)="view.set('blocked')">
            <lucide-icon [img]="icons.OctagonAlert" [size]="15" [class]="e.blocked_by.length ? 'text-danger' : 'text-fg-muted'" aria-hidden="true" />
            <span class="flex-1">What blocks planning</span><span [class]="count(e.blocked_by.length > 0)">{{ e.blocked_by.length }}</span>
          </button>

          <h3 [class]="heading">VIP groups</h3>
          @for (g of groups(); track g.id) {
            <button
              type="button"
              [class]="item(groupView(g.id))"
              [attr.aria-current]="view() === groupView(g.id)"
              [attr.aria-label]="g.label + ', ' + g.services.length + ' services' + (g.blocked ? ', blocked' : '')"
              (click)="view.set(groupView(g.id))"
            >
              <span [class]="vipBadge(g.blocked)" aria-hidden="true">{{ g.number }}</span>
              <span class="flex-1 truncate">{{ g.hosts || 'Empty' }}</span>
              <span [class]="count(false)">{{ g.services.length }}</span>
            </button>
          }
          @if (ungrouped().length) {
            <button type="button" [class]="item('none')" (click)="view.set('board')">
              <lucide-icon [img]="icons.CircleDashed" [size]="15" class="text-danger" aria-hidden="true" />
              <span class="flex-1 text-danger">Not grouped</span><span [class]="count(true)">{{ ungrouped().length }}</span>
            </button>
          }

          <h3 [class]="heading">Read only</h3>
          <button type="button" [class]="item('published')" [attr.aria-current]="view() === 'published'" (click)="view.set('published')">
            <lucide-icon [img]="icons.Share2" [size]="15" [class]="publishedBlocked() ? 'text-danger' : 'text-fg-muted'" aria-hidden="true" />
            <span class="flex-1">Already published</span><span [class]="count(false)">{{ published().length }}</span>
          </button>
          <button type="button" [class]="item('excluded')" [attr.aria-current]="view() === 'excluded'" (click)="view.set('excluded')">
            <lucide-icon [img]="icons.EyeOff" [size]="15" class="text-fg-muted" aria-hidden="true" />
            <span class="flex-1">Excluded</span><span [class]="count(false)">{{ excluded().length }}</span>
          </button>
        </aside>

        <section class="overflow-auto px-7 pb-12 pt-6" aria-labelledby="detail-heading">
          @switch (view()) {
            @case ('blocked') {
              <h2 id="detail-heading" [class]="title">What blocks planning</h2>
              <p [class]="subtitle">Each of these keeps a plan from being requested. They are fixed here, or on a new scan.</p>
              @if (e.blocked_by.length) {
                <ul class="space-y-2">
                  @for (n of e.blocked_by; track $index) {
                    <li class="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
                      <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-danger-bg text-danger">
                        <lucide-icon [img]="icons.OctagonAlert" [size]="14" aria-hidden="true" />
                      </span>
                      <span class="leading-relaxed">{{ n.message }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="flex items-center gap-2 rounded-xl border border-ok-line bg-ok-bg px-4 py-3 text-ok">Nothing. A plan can be requested.</p>
              }
            }
            @case ('published') {
              <h2 id="detail-heading" [class]="title">Already published</h2>
              <p [class]="subtitle">No VIP. The app's rewrite map points them at their registry URL.</p>
              <div [class]="tableWrap">
                <table class="w-full text-left">
                  <thead [class]="thead">
                    <tr><th [class]="th" class="w-[34%]">Origin</th><th class="w-8"><span class="sr-only">to</span></th><th [class]="th" class="w-[34%]">Rewritten to</th><th [class]="th">Registry note</th></tr>
                  </thead>
                  <tbody>
                    @for (s of published(); track s.id) {
                      <tr [class]="tr">
                        <td [class]="td" class="font-mono text-[12.5px]">{{ origin(s) }}</td>
                        <td class="text-fg-subtle"><lucide-icon [img]="icons.ArrowRight" [size]="14" aria-hidden="true" /></td>
                        <td [class]="td" class="font-mono text-[12.5px]">
                          @if (s.scope === 'unresolved') {
                            <span [class]="dangerPill"><lucide-icon [img]="icons.OctagonAlert" [size]="12" aria-hidden="true" />registry entry removed</span>
                          } @else if (s.registry_entry?.url) {
                            {{ s.registry_entry?.url }}
                          } @else {
                            <span [class]="dangerPill"><lucide-icon [img]="icons.OctagonAlert" [size]="12" aria-hidden="true" />no URL</span>
                          }
                        </td>
                        <td [class]="td" class="text-[13px] text-fg-subtle">{{ s.registry_entry?.note }}</td>
                      </tr>
                    } @empty {
                      <tr><td [class]="td" colspan="4" class="text-fg-subtle">None.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @case ('excluded') {
              <h2 id="detail-heading" [class]="title">Excluded</h2>
              <p [class]="subtitle">Excluded on the scan, so out of scope.</p>
              <div [class]="tableWrap">
                <table class="w-full text-left">
                  <thead [class]="thead"><tr><th [class]="th">Origin</th><th [class]="th">Auth method</th></tr></thead>
                  <tbody>
                    @for (s of excluded(); track s.id) {
                      <tr [class]="tr">
                        <td [class]="td" class="font-mono text-[12.5px] text-fg-muted">{{ origin(s) }}</td>
                        <td [class]="td"><span [class]="authPill(s)">{{ s.auth_method }}</span></td>
                      </tr>
                    } @empty {
                      <tr><td [class]="td" colspan="2" class="text-fg-subtle">None.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @default {
              <h2 id="detail-heading" [class]="title">{{ selectedGroup()?.label ?? 'VIP groups' }}</h2>
              <p [class]="subtitle">Services in one group share a VIP: one IP, HTTPS on 443.</p>
              @if (appBlockers().length) {
                <div class="mb-5 flex items-start gap-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-danger">
                  <lucide-icon [img]="icons.OctagonAlert" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                  <ul>
                    @for (n of appBlockers(); track $index) {
                      <li>{{ n.message }}</li>
                    }
                  </ul>
                </div>
              }
              <div class="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2" [class.max-w-md]="selectedGroup()">
                @if (!selectedGroup() && ungrouped().length) {
                  <div class="min-h-44 rounded-xl border border-dashed border-danger bg-surface-2 p-2.5" role="group" aria-label="Not grouped">
                    <h3 class="mx-1 mb-2.5 mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-danger">
                      <lucide-icon [img]="icons.CircleDashed" [size]="15" aria-hidden="true" />Not grouped
                      <span [class]="count(true)">{{ ungrouped().length }}</span>
                    </h3>
                    @for (s of ungrouped(); track s.id) {
                      <ng-container *ngTemplateOutlet="card; context: { $implicit: s }" />
                    }
                  </div>
                }
                @for (g of shownGroups(); track g.id) {
                  <div class="min-h-44 rounded-xl border border-border bg-surface-2 p-2.5" role="group" [attr.aria-label]="g.label">
                    <h3 class="mx-1 mb-2.5 mt-0.5 flex items-center gap-2 text-[13px] font-semibold">
                      <span [class]="vipBadge(g.blocked)" aria-hidden="true">{{ g.number }}</span>
                      <span class="flex-1 truncate">VIP {{ g.number }}<span class="font-normal text-fg-muted"> · {{ g.hosts }}</span></span>
                      <span [class]="count(false)">{{ g.services.length }}</span>
                    </h3>
                    @for (s of g.services; track s.id) {
                      <ng-container *ngTemplateOutlet="card; context: { $implicit: s }" />
                    } @empty {
                      <p class="grid h-24 place-items-center rounded-lg border border-dashed border-border text-[13px] text-fg-subtle">No services</p>
                    }
                  </div>
                }
              </div>
            }
          }
        </section>
      </div>

      <ng-template #card let-s>
        <article
          class="mb-2 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-card transition-shadow last:mb-0 hover:shadow-raised"
          [attr.aria-label]="origin(s)"
        >
          <div class="break-all font-mono text-[12.5px] font-medium">{{ origin(s) }}</div>
          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span [class]="authPill(s)"><lucide-icon [img]="icons.KeyRound" [size]="11" aria-hidden="true" />{{ s.auth_method }}</span>
            <span class="inline-flex items-center gap-1 text-fg-muted" [title]="s.ips?.join(', ') ?? ''">
              <lucide-icon [img]="icons.Server" [size]="12" aria-hidden="true" />{{ members(s) }}
            </span>
            <span class="ml-auto flex gap-1">
              @for (scanner of s.found_by; track scanner) {
                <span class="rounded border border-border px-1 text-[11px] text-fg-subtle">{{ scanner }}</span>
              }
            </span>
          </div>
          @for (n of blockersOf(e, s); track $index) {
            <p class="mt-2 flex gap-1.5 rounded-md border-l-2 border-danger bg-danger-bg px-2 py-1.5 text-xs leading-relaxed text-danger">
              <lucide-icon [img]="icons.OctagonAlert" [size]="13" class="mt-px shrink-0" aria-hidden="true" />{{ n.message }}
            </p>
          }
          @for (n of s.warnings; track $index) {
            <p class="mt-2 flex gap-1.5 rounded-md border-l-2 border-warn bg-warn-bg px-2 py-1.5 text-xs leading-relaxed text-warn">
              <lucide-icon [img]="icons.TriangleAlert" [size]="13" class="mt-px shrink-0" aria-hidden="true" />{{ n.message }}
            </p>
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

  protected readonly icons = {
    ArrowLeft,
    ArrowRight,
    CircleDashed,
    Clock,
    EyeOff,
    GitCompareArrows,
    Globe,
    KeyRound,
    LayoutGrid,
    OctagonAlert,
    Radar,
    Server,
    Share2,
    TriangleAlert,
    User
  };

  private readonly blockedServices = computed(
    () => new Set((this.exposure()?.blocked_by ?? []).map((n) => n.service_id).filter((id) => id !== null))
  );

  protected readonly groups = computed<GroupView[]>(() => {
    const e = this.exposure();
    if (!e) return [];
    const byId = new Map(e.services.map((s) => [s.id, s]));
    return e.groups.map((g, i) => {
      const services = g.service_ids.map((id) => byId.get(id)).filter((s): s is ExposureService => !!s);
      const hosts = [...new Set(services.map((s) => s.host.split('.')[0]))].join(', ');
      return {
        id: g.id,
        number: i + 1,
        label: hosts ? `VIP ${i + 1} · ${hosts}` : `VIP ${i + 1}`,
        hosts,
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

  /** The header's facts, each with its icon; the label is for screen readers. */
  protected readonly meta = computed(() => {
    const e = this.exposure();
    if (!e) return [];
    const date = formatDate(e.submitted_at, 'MMM d, y · HH:mm', 'en-US');
    const items: {
      label: string;
      icon: typeof Globe;
      text?: string;
      mono?: boolean;
      danger?: boolean;
      title?: string;
      prefix?: string;
      link?: string;
    }[] = [
      { label: 'App URL', icon: Globe, text: e.app.url ?? 'no URL', mono: true, danger: !e.app.url },
      { label: 'Scan', icon: Radar, text: e.scan_id.slice(0, 8), mono: true, title: e.scan_id },
      { label: 'Submitted by', icon: User, text: e.submitted_by },
      { label: 'Submitted', icon: Clock, text: date }
    ];
    if (e.supersedes) items.push({ label: 'Replaces', icon: GitCompareArrows, prefix: 'replaces', link: e.supersedes });
    if (e.superseded_by) items.push({ label: 'Replaced by', icon: GitCompareArrows, prefix: 'replaced by', link: e.superseded_by });
    return items;
  });

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
  protected readonly heading = 'mx-2 mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle';
  protected readonly title = 'text-lg font-semibold tracking-tight';
  protected readonly subtitle = 'mb-5 mt-0.5 text-[13px] text-fg-muted';
  protected readonly tableWrap = 'overflow-hidden rounded-xl border border-border bg-surface shadow-card';
  protected readonly thead = 'border-b border-border bg-surface-2 text-xs text-fg-muted';
  protected readonly th = 'px-4 py-2.5 font-medium';
  protected readonly tr = 'border-t border-border-soft transition-colors first:border-t-0 hover:bg-surface-2';
  protected readonly td = 'px-4 py-2.5 align-middle';
  protected readonly dangerPill =
    'inline-flex items-center gap-1 rounded-full border border-danger-line bg-danger-bg px-2 py-0.5 font-sans text-xs font-medium text-danger';

  protected item(view: string): string {
    const current = this.view() === view;
    return (
      'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ' +
      (current ? 'bg-accent-bg font-medium text-fg shadow-[inset_2px_0_var(--color-accent)]' : 'hover:bg-border-soft')
    );
  }

  protected count(alert: boolean): string {
    return (
      'min-w-5 rounded-full px-1.5 text-center text-xs font-medium tabular-nums ' +
      (alert ? 'bg-danger text-white' : 'bg-border-soft text-fg-muted')
    );
  }

  /** A group's number, ringed in red when something in it blocks planning. */
  protected vipBadge(blocked: boolean): string {
    return (
      'grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ring-1 ring-inset ' +
      (blocked ? 'bg-danger-bg text-danger ring-danger-line' : 'bg-surface text-fg-muted ring-border')
    );
  }

  /** Kerberos is flagged: v1 cannot publish it. */
  protected authPill(s: ExposureService): string {
    return (
      'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-sans text-[11px] font-medium ' +
      (s.auth_method === 'kerberos' && s.scope === 'needs_vip'
        ? 'border-danger-line bg-danger-bg text-danger'
        : 'border-accent-line bg-accent-bg text-accent')
    );
  }
}
