import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CircleDashed,
  FileText,
  Play,
  RotateCcw,
  Server,
  Clock,
  EyeOff,
  GitCompareArrows,
  Globe,
  Info,
  LayoutGrid,
  LucideAngularModule,
  OctagonAlert,
  Radar,
  RefreshCw,
  Rocket,
  ScrollText,
  Share2,
  User
} from 'lucide-angular';
import type { AgentPhase, ExposureDetail, ExposureNotice, ExposureStatus } from '@core/models';
import { phaseProgress, stepBegun } from '@lib/agent-steps';
import { type EventTone, describeEvent } from '@lib/events';
import {
  type GroupingDraft,
  addGroup,
  draftFrom,
  isDirty,
  moveService,
  moveToNewGroup,
  removeGroup,
  saveBlocker,
  toRequest
} from '@lib/grouping-draft';
import { apiError } from '@lib/http-error';
import { formatOrigin } from '@lib/origin';
import { StatusBadgeComponent } from '@shared/status-badge.component';
import { UrlFormComponent } from '@shared/url-form.component';
import { injectExposureEvents } from '../data/exposure-events';
import { useExposureActionMutation, useExposureQuery, useSaveGroupsMutation, useSetUrlMutation } from '../data/exposures.queries';
import { AgentProgressComponent } from './agent-progress.component';
import { ConfirmPanelComponent } from './confirm-panel.component';
import { DeploymentComponent } from './deployment.component';
import { GroupingBoardComponent, type MoveRequest } from './grouping-board.component';
import { type PlanPart, PlanReviewComponent } from './plan-review.component';

/** What the right pane shows: all the groups, one of them, or a section. */
type View =
  | 'board'
  | 'blocked'
  | 'published'
  | 'excluded'
  | 'events'
  | 'deployment'
  | `group:${string}`
  | `plan:${PlanPart}`;

/** The statuses whose grouping can change; saving in the last two drops the plan. */
const EDITABLE: readonly ExposureStatus[] = ['grouping', 'planning', 'awaiting_confirmation'];

/**
 * One exposure, master and detail (docs/exposure-console-ui.md, Grouping):
 * the left pane lists the groups and sections, the right pane shows the one
 * selected. The grouping is edited as a draft and saved whole.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    RouterLink,
    StatusBadgeComponent,
    LucideAngularModule,
    GroupingBoardComponent,
    UrlFormComponent,
    PlanReviewComponent,
    ConfirmPanelComponent,
    AgentProgressComponent,
    DeploymentComponent
  ],
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
          <div class="ml-auto flex items-center gap-2">
            @if (cancellable()) {
              <button type="button" [class]="secondaryButton" class="!text-danger" (click)="cancelOpen.set(true)">
                <lucide-icon [img]="icons.Ban" [size]="14" aria-hidden="true" />Cancel exposure
              </button>
            }
            @switch (e.status) {
              @case ('grouping') {
                <button
                  type="button"
                  [class]="primaryButton"
                  [disabled]="!!planBlocker() || act.isPending()"
                  [title]="planBlocker() ?? 'Ask the agent to reserve IPs, request certificates and dry-run the declaration'"
                  (click)="run('plan')"
                >
                  <lucide-icon [img]="icons.Play" [size]="14" aria-hidden="true" />Request plan
                </button>
              }
              @case ('awaiting_confirmation') {
                <button type="button" [class]="primaryButton" [disabled]="dirty()" (click)="confirmOpen.set(true)">
                  Review and deploy
                  <span class="rounded-full bg-white/25 px-1.5 text-xs">{{ warningCount() }} to acknowledge</span>
                </button>
              }
              @case ('failed') {
                <button type="button" [class]="primaryButton" [disabled]="act.isPending()" (click)="run('retry')">
                  <lucide-icon [img]="icons.RotateCcw" [size]="14" aria-hidden="true" />{{ retryLabel() }}
                </button>
              }
            }
          </div>
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
            <span class="flex-1">All VIP groups</span>
            @if (dirty()) {
              <span class="size-1.5 rounded-full bg-warn" title="Unsaved changes" aria-label="unsaved changes"></span>
            }
            <span [class]="count(false)">{{ sideGroups().length }}</span>
          </button>
          <button type="button" [class]="item('blocked')" [attr.aria-current]="view() === 'blocked'" (click)="view.set('blocked')">
            <lucide-icon [img]="icons.OctagonAlert" [size]="15" [class]="e.blocked_by.length ? 'text-danger' : 'text-fg-muted'" aria-hidden="true" />
            <span class="flex-1">What blocks planning</span><span [class]="count(e.blocked_by.length > 0)">{{ e.blocked_by.length }}</span>
          </button>

          <h3 [class]="heading">VIP groups</h3>
          @for (g of sideGroups(); track g.key) {
            <button
              type="button"
              [class]="item(groupView(g.key))"
              [attr.aria-current]="view() === groupView(g.key)"
              [attr.aria-label]="g.label + ', ' + g.count + ' services' + (g.blocked ? ', blocked' : '')"
              (click)="view.set(groupView(g.key))"
            >
              <span [class]="vipBadge(g.blocked)" aria-hidden="true">{{ g.number }}</span>
              <span class="flex-1 truncate" [class.italic]="!g.hosts" [class.text-fg-subtle]="!g.hosts">{{ g.hosts || 'Empty' }}</span>
              <span [class]="count(false)">{{ g.count }}</span>
            </button>
          }
          @if (draft()?.ungrouped?.length) {
            <button type="button" [class]="item('none')" (click)="view.set('board')">
              <lucide-icon [img]="icons.CircleDashed" [size]="15" class="text-danger" aria-hidden="true" />
              <span class="flex-1 text-danger">Not grouped</span><span [class]="count(true)">{{ draft()?.ungrouped?.length }}</span>
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

          @if (e.deployment) {
            <h3 [class]="heading">Live</h3>
            <button type="button" [class]="item('deployment')" [attr.aria-current]="view() === 'deployment'" (click)="view.set('deployment')">
              <lucide-icon [img]="icons.Rocket" [size]="15" class="text-ok" aria-hidden="true" />
              <span class="flex-1">Deployment</span>
            </button>
          }

          @if (e.plan; as plan) {
            <h3 [class]="heading">Plan · v{{ e.plan_version }}</h3>
            <button type="button" [class]="item('plan:summary')" [attr.aria-current]="view() === 'plan:summary'" (click)="view.set('plan:summary')">
              <lucide-icon [img]="icons.FileText" [size]="15" class="text-fg-muted" aria-hidden="true" />
              <span class="flex-1">Summary</span>
              <span class="text-xs font-medium tabular-nums"><span class="text-ok">+{{ plan.summary.add }}</span> <span class="text-warn">~{{ plan.summary.change }}</span></span>
            </button>
            @for (v of plan.vips; track v.group_id; let i = $index) {
              <button type="button" [class]="item('plan:vip:' + i)" [attr.aria-current]="view() === 'plan:vip:' + i" (click)="view.set(planView('vip:' + i))">
                <lucide-icon [img]="icons.Server" [size]="15" class="text-fg-muted" aria-hidden="true" />
                <span class="flex-1">VIP {{ i + 1 }} <span class="font-mono text-xs text-fg-muted">{{ v.ip }}</span></span>
                <span [class]="count(false)">{{ v.services.length }}</span>
              </button>
            }
            <button type="button" [class]="item('plan:app')" [attr.aria-current]="view() === 'plan:app'" (click)="view.set('plan:app')">
              <lucide-icon [img]="icons.Globe" [size]="15" class="text-fg-muted" aria-hidden="true" />
              <span class="flex-1">App VIP · rewrite map</span><span [class]="count(false)">{{ plan.rewrite.length }}</span>
            </button>
            <button type="button" [class]="item('plan:diff')" [attr.aria-current]="view() === 'plan:diff'" (click)="view.set('plan:diff')">
              <lucide-icon [img]="icons.GitCompareArrows" [size]="15" class="text-fg-muted" aria-hidden="true" />
              <span class="flex-1">Dry-run diff</span>
            </button>
            <button type="button" [class]="item('plan:declaration')" [attr.aria-current]="view() === 'plan:declaration'" (click)="view.set('plan:declaration')">
              <lucide-icon [img]="icons.ScrollText" [size]="15" class="text-fg-muted" aria-hidden="true" />
              <span class="flex-1">Declaration</span>
            </button>
          }

          <h3 [class]="heading">Activity</h3>
          <button type="button" [class]="item('events')" [attr.aria-current]="view() === 'events'" (click)="view.set('events')">
            <lucide-icon [img]="icons.ScrollText" [size]="15" class="text-fg-muted" aria-hidden="true" />
            <span class="flex-1">Event log</span>
            @if (stream.state() === 'live') {
              <span class="size-1.5 rounded-full bg-ok" title="Live" aria-label="live"></span>
            }
            <span [class]="count(false)">{{ stream.events().length }}</span>
          </button>
        </aside>

        <div class="flex min-h-0 flex-col">
          <section class="flex-1 overflow-auto px-7 pb-12 pt-6" aria-labelledby="detail-heading">
            @if (e.failed; as failed) {
              <div class="mb-5 flex items-start gap-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-danger" role="alert">
                <lucide-icon [img]="icons.OctagonAlert" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                <div class="flex-1">
                  <p class="font-medium">{{ phaseLabel(failed.phase) }} failed{{ failed.step ? ' at ' + failed.step : '' }}.</p>
                  <p class="mt-0.5 text-[13px]">{{ failed.message }}</p>
                  <p class="mt-1 text-[13px] text-fg-muted">{{ failedHint(failed.phase) }}</p>
                </div>
              </div>
            }
            @if (progressPhase(); as phase) {
              <app-agent-progress
                class="mb-5 block"
                [steps]="progress()"
                [working]="agentWorking()"
                [heading]="progressHeading()"
                [label]="agentWorking() ? 'Agent progress' : 'Where it stopped'"
              >
                @if (e.status === 'deploying') {
                  <p class="mt-3 border-t border-accent-line pt-2 text-xs text-fg-muted">
                    Confirmed by {{ e.confirmed_by }}{{ e.confirmed_at ? ' on ' + formatWhen(e.confirmed_at) : '' }}. A deploy in progress cannot be stopped.
                  </p>
                }
              </app-agent-progress>
            }
            @if (actError()) {
              <p class="mb-5 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-[13px] text-danger" role="alert">{{ actError() }}</p>
            }
            @if (planPart(); as part) {
              @if (e.plan; as plan) {
                <app-plan-review [plan]="plan" [part]="part" />
              }
            } @else {
            @switch (view()) {
              @case ('deployment') {
                <app-deployment [exposure]="e" />
              }
              @case ('blocked') {
                <h2 id="detail-heading" [class]="title">What blocks planning</h2>
                <p [class]="subtitle">Each of these keeps a plan from being requested, as the exposure is saved. They are fixed here, or on a new scan.</p>
                @if (e.blocked_by.length) {
                  <ul class="space-y-2">
                    @for (n of e.blocked_by; track $index) {
                      <li class="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
                        <div class="flex items-start gap-3">
                          <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-danger-bg text-danger">
                            <lucide-icon [img]="icons.OctagonAlert" [size]="14" aria-hidden="true" />
                          </span>
                          <span class="flex-1 leading-relaxed">{{ n.message }}</span>
                          @if (entryToFix(e, n); as entryId) {
                            @if (!isEditingUrl(entryId) && editable()) {
                              <button type="button" [class]="linkButton" (click)="openUrlForm(entryId)">Set URL</button>
                            }
                          }
                        </div>
                        @if (entryToFix(e, n); as entryId) {
                          @if (isEditingUrl(entryId)) {
                            <div class="mt-3 pl-9">
                              <app-url-form
                                label="Registry URL"
                                placeholder="https://name.example.com"
                                [pending]="setUrl.isPending()"
                                [error]="urlError()"
                                (saved)="saveUrl(entryId, $event)"
                                (cancelled)="closeUrlForm()"
                              />
                            </div>
                          }
                        }
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
                            } @else if (s.registry_entry && isEditingUrl(s.registry_entry.id)) {
                              <app-url-form
                                label="Registry URL"
                                placeholder="https://name.example.com"
                                [pending]="setUrl.isPending()"
                                [error]="urlError()"
                                (saved)="saveUrl(s.registry_entry.id, $event)"
                                (cancelled)="closeUrlForm()"
                              />
                            } @else {
                              <span class="flex items-center gap-2">
                                <span [class]="dangerPill"><lucide-icon [img]="icons.OctagonAlert" [size]="12" aria-hidden="true" />no URL</span>
                                @if (s.registry_entry && editable()) {
                                  <button type="button" [class]="linkButton" (click)="openUrlForm(s.registry_entry.id)">Set URL</button>
                                }
                              </span>
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
                          <td [class]="td"><span class="rounded-full border border-border px-1.5 py-px text-[11px] font-medium text-fg-muted">{{ s.auth_method }}</span></td>
                        </tr>
                      } @empty {
                        <tr><td [class]="td" colspan="2" class="text-fg-subtle">None.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              @case ('events') {
                <div class="flex items-center gap-3">
                  <h2 id="detail-heading" [class]="title">Event log</h2>
                  <span [class]="streamPill()">
                    <span class="size-1.5 rounded-full bg-current" [class.animate-pulse]="stream.state() === 'live'" aria-hidden="true"></span>
                    {{ streamLabel() }}
                  </span>
                </div>
                <p [class]="subtitle">Every admin action with who and when, and every step the agent reports. Newest first.</p>
                @if (stream.events().length === 0) {
                  <p class="text-fg-subtle">{{ stream.state() === 'connecting' ? 'Loading…' : 'No events yet.' }}</p>
                } @else {
                  <ol class="ml-2 border-l border-border">
                    @for (ev of eventsNewestFirst(); track ev.seq) {
                      <li class="relative mb-5 pl-6 last:mb-0">
                        <span [class]="eventDot(ev.tone)" aria-hidden="true"></span>
                        <div class="leading-snug">
                          <span class="font-medium">{{ ev.actor }}</span>
                          <span class="text-fg-muted"> · {{ ev.text }}</span>
                          @if (ev.link; as link) {
                            <span class="text-fg-muted"> {{ link.prefix }} </span>
                            <a [routerLink]="['/exposures', link.exposureId]" class="font-mono text-[12.5px] text-accent hover:underline">{{ link.exposureId }}</a>
                          }
                        </div>
                        <time class="mt-0.5 block text-xs tabular-nums text-fg-subtle" [attr.datetime]="ev.iso">{{ ev.when }}</time>
                      </li>
                    }
                  </ol>
                }
              }
              @default {
                <h2 id="detail-heading" [class]="title">{{ selectedGroup()?.label ?? 'VIP groups' }}</h2>
                <p [class]="subtitle">
                  Services in one group share a VIP: one IP, HTTPS on 443.
                  @if (editable()) {
                    Drag a card, or focus it and press 1–9 for a VIP, N for a new one, 0 to take it out.
                  }
                </p>

                @if (conflict()) {
                  <div class="mb-4 flex items-start gap-3 rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-warn" role="alert">
                    <lucide-icon [img]="icons.RefreshCw" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                    <div class="flex-1">
                      <p class="font-medium">{{ conflictBy() ?? 'Someone' }} changed this exposure while you were editing (now version {{ e.version }}).</p>
                      <p class="text-[13px]">Your changes are based on version {{ draft()?.baseVersion }} and can no longer be saved. Reload to see theirs; yours will be discarded.</p>
                    </div>
                    <button type="button" class="rounded-md border border-warn-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-surface-2" (click)="discard()">Reload</button>
                  </div>
                }
                @if (editable() && e.status !== 'grouping') {
                  <div class="mb-4 flex items-start gap-3 rounded-xl border border-accent-line bg-accent-bg px-4 py-3 text-[13px]">
                    <lucide-icon [img]="icons.Info" [size]="16" class="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    Saving a change moves this exposure back to grouping and drops its plan.
                  </div>
                }
                @if (appBlockers().length) {
                  <div class="mb-5 flex items-start gap-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-danger">
                    <lucide-icon [img]="icons.OctagonAlert" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                    <ul class="flex-1">
                      @for (n of appBlockers(); track $index) {
                        <li>{{ n.message }}</li>
                      }
                    </ul>
                  </div>
                }

                @if (draft(); as d) {
                  <app-grouping-board
                    [exposure]="e"
                    [draft]="d"
                    [editable]="editable()"
                    [only]="selectedGroup()?.key ?? null"
                    [errors]="saveErrors()"
                    (moved)="move($event)"
                    (added)="addEmptyGroup()"
                    (removed)="removeEmptyGroup($event)"
                  />
                }
              }
            }
            }
          </section>

          @if (confirmOpen() && e.plan) {
            <app-confirm-panel
              [exposure]="e"
              [pending]="act.isPending()"
              [error]="actError()"
              (confirmed)="run('confirm')"
              (closed)="confirmOpen.set(false); actError.set(null)"
            />
          }
          @if (cancelOpen()) {
            <div class="fixed inset-0 z-40 bg-black/30" aria-hidden="true" (click)="cancelOpen.set(false)"></div>
            <div
              class="fixed left-1/2 top-24 z-50 w-[440px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border border-border bg-surface p-5 shadow-raised"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancel-title"
              (keydown.escape)="cancelOpen.set(false)"
            >
              <h2 id="cancel-title" class="text-lg font-semibold tracking-tight">Cancel this exposure?</h2>
              <p class="mt-2 text-[13px] text-fg-muted">It closes for good; a new submission of the app starts a new one.</p>
              @if (cancelReleases().length) {
                <p class="mt-3 text-[13px] font-medium">
                  {{ e.failed?.phase === 'deploying' ? 'The agent undoes the deploy, in reverse:' : 'The agent releases what it holds:' }}
                </p>
                <ul class="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                  @for (r of cancelReleases(); track r) {
                    <li>{{ r }}</li>
                  }
                </ul>
              } @else if (e.status === 'grouping' && e.version === 1 && !stream.events().length) {
                <p class="mt-3 text-[13px]">Nothing has been reserved for it.</p>
              } @else {
                <p class="mt-3 text-[13px]">The agent releases whatever it holds for it, from its own record.</p>
              }
              <div class="mt-5 flex justify-end gap-2">
                <button type="button" class="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-muted hover:bg-border-soft" (click)="cancelOpen.set(false)">Keep it</button>
                <button type="button" class="rounded-md bg-danger px-3.5 py-1.5 text-[13px] font-medium text-white" [disabled]="act.isPending()" (click)="run('cancel')">
                  Cancel exposure
                </button>
              </div>
            </div>
          }

          @if (dirty() || saveMessage()) {
            <div class="flex items-center gap-3 border-t border-border bg-surface px-7 py-3 shadow-raised" role="region" aria-label="Unsaved changes">
              <span class="size-2 rounded-full bg-warn" aria-hidden="true"></span>
              <div class="flex-1 text-[13px]">
                @if (saveMessage(); as message) {
                  <span class="text-danger" role="alert">{{ message }}</span>
                } @else if (blockedSave(); as reason) {
                  <span class="text-fg-muted">{{ reason }}</span>
                } @else {
                  <span class="font-medium">Unsaved changes to the grouping</span>
                }
              </div>
              <button type="button" class="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-muted hover:bg-border-soft hover:text-fg" (click)="discard()">Discard</button>
              <button
                type="button"
                class="rounded-md bg-ok px-3.5 py-1.5 text-[13px] font-medium text-white shadow-card transition-opacity disabled:opacity-50"
                [disabled]="!!blockedSave() || conflict() || save.isPending() || !dirty()"
                (click)="saveGrouping()"
              >
                {{ save.isPending() ? 'Saving…' : 'Save grouping' }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class WorkspaceComponent {
  /** The route's :id. */
  readonly id = input.required<string>();
  protected readonly query = useExposureQuery(this.id);
  protected readonly exposure = computed(() => this.query.data());
  protected readonly view = signal<View>('board');
  protected readonly stream = injectExposureEvents(this.id);
  protected readonly save = useSaveGroupsMutation(this.id);
  protected readonly setUrl = useSetUrlMutation(this.id);
  protected readonly act = useExposureActionMutation(this.id);

  // ---- Planning, confirming, retrying, cancelling ------------------------------

  protected readonly confirmOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly actError = signal<string | null>(null);

  protected readonly planPart = computed<PlanPart | null>(() => {
    const view = this.view();
    return view.startsWith('plan:') && this.exposure()?.plan ? (view.slice(5) as PlanPart) : null;
  });
  protected readonly cancellable = computed(() => {
    const status = this.exposure()?.status;
    return status === 'grouping' || status === 'planning' || status === 'awaiting_confirmation' || status === 'failed';
  });
  /** Why a plan cannot be requested now, or null. */
  protected readonly planBlocker = computed(() => {
    const e = this.exposure();
    if (!e) return 'Loading';
    if (this.dirty()) return 'Save or discard the grouping first';
    if (e.blocked_by.length) return `${e.blocked_by.length} thing${e.blocked_by.length === 1 ? '' : 's'} block planning`;
    return null;
  });
  protected readonly agentWorking = computed(() => {
    const status = this.exposure()?.status;
    return status === 'planning' || status === 'cancelling' || status === 'deploying';
  });
  /** The phase whose steps the progress card lists: the one under way, or the one that failed. */
  protected readonly progressPhase = computed<AgentPhase | null>(() => {
    const e = this.exposure();
    if (!e) return null;
    if (this.agentWorking()) return e.status as AgentPhase;
    return e.failed?.phase ?? null;
  });
  /** Every step of that phase, with its latest report for the current version. */
  protected readonly progress = computed(() => {
    const phase = this.progressPhase();
    const e = this.exposure();
    return phase && e ? phaseProgress(phase, this.stream.events(), e.version) : [];
  });
  protected readonly progressHeading = computed(() => {
    const phase = this.progressPhase();
    if (!phase) return '';
    if (!this.agentWorking()) return `Where ${phase} stopped`;
    const started = this.progress().some((p) => p.state !== 'pending');
    return `${this.phaseLabel(phase)}: ${started ? 'the agent is at work.' : 'waiting for the agent to pick it up.'}`;
  });
  protected readonly retryLabel = computed(() => {
    const failed = this.exposure()?.failed;
    if (!failed) return 'Retry';
    return failed.phase === 'deploying' && failed.step ? `Retry from ${failed.step}` : `Retry ${failed.phase}`;
  });
  /**
   * What cancelling does, in the order the agent does it. After a failed
   * deploy, the steps it began are undone first, from the event log.
   */
  protected readonly cancelReleases = computed(() => {
    const e = this.exposure();
    const plan = e?.plan;
    if (!e || !plan) return [];
    const out: string[] = [];
    if (e.failed?.phase === 'deploying') {
      const events = this.stream.events();
      if (stepBegun(events, e.version, 'dns')) out.push('The DNS records it created are deleted');
      if (stepBegun(events, e.version, 'deploy')) {
        out.push(
          plan.app.existing
            ? `Partition ${plan.partition} goes back to its declaration from before the deploy`
            : `Partition ${plan.partition} is removed from the F5`
        );
      }
    }
    out.push(`${plan.summary.certificates} certificates are removed from the F5`);
    out.push(`IP reservations are released: ${this.heldIps().join(', ')}`);
    return out;
  });
  protected readonly warningCount = computed(
    () => (this.exposure()?.services.reduce((n, s) => n + s.warnings.length, 0) ?? 0) + 1
  );
  protected readonly heldIps = computed(() => {
    const plan = this.exposure()?.plan;
    return plan ? [...plan.vips.map((v) => v.ip), ...(plan.app.existing ? [] : [plan.app.ip])] : [];
  });

  protected planView(part: string): View {
    return `plan:${part}` as View;
  }

  protected phaseLabel(phase: string): string {
    return ({ planning: 'Planning', deploying: 'Deploying', cancelling: 'Cancelling' } as Record<string, string>)[phase] ?? phase;
  }

  protected failedHint(phase: AgentPhase): string {
    return {
      planning: 'Retry plans again, reusing what the exposure holds; cancel releases it.',
      deploying: 'Retry resumes from that step, without repeating the ones before it; cancel undoes those, in reverse.',
      cancelling: 'Retry cancels again; each step is safe to repeat.'
    }[phase];
  }

  protected formatWhen(iso: string): string {
    return formatDate(iso, 'MMM d, y · HH:mm', 'en-US');
  }

  protected run(action: 'plan' | 'confirm' | 'retry' | 'cancel'): void {
    const e = this.exposure();
    if (!e) return;
    this.actError.set(null);
    this.act.mutate(
      { action, version: e.version, plan_hash: action === 'confirm' ? (e.plan_hash ?? undefined) : undefined },
      {
        onSuccess: (detail) => {
          this.confirmOpen.set(false);
          this.cancelOpen.set(false);
          if (action === 'confirm' || action === 'cancel') this.view.set('events');
          if (detail.status === 'grouping') this.reset(detail);
        },
        onError: (err) => {
          const error = apiError(err);
          const reasons = (error as { blocked_by?: { message: string }[] }).blocked_by?.map((b) => b.message) ?? [];
          this.actError.set(`Not done: ${error.message}${reasons.length ? ': ' + reasons.join(' ') : ''}.`);
          this.cancelOpen.set(false);
        }
      }
    );
  }

  // ---- The grouping draft ----------------------------------------------------

  /** The grouping being edited; replaced by the saved one whenever there is nothing unsaved. */
  protected readonly draft = signal<GroupingDraft | null>(null);
  /** The saved exposure the draft was made from. */
  private readonly baseline = signal<ExposureDetail | null>(null);
  protected readonly saveErrors = signal<Record<string, string[]>>({});
  protected readonly saveMessage = signal<string | null>(null);

  protected readonly editable = computed(() => {
    const e = this.exposure();
    return !!e && EDITABLE.includes(e.status);
  });
  protected readonly dirty = computed(() => {
    const d = this.draft();
    const base = this.baseline();
    return !!d && !!base && isDirty(d, base);
  });
  /** Someone else saved since this draft was made: it would be refused. */
  protected readonly conflict = computed(() => {
    const e = this.exposure();
    const d = this.draft();
    return this.dirty() && !!e && !!d && e.version !== d.baseVersion;
  });
  /** Who made the change behind a conflict, from the event log. */
  protected readonly conflictBy = computed(() => {
    const base = this.draft()?.baseVersion ?? 0;
    const later = this.stream.events().filter((ev) => ev.type === 'grouping_saved' && Number(ev.payload['version']) > base);
    return later.length ? later[later.length - 1].actor : null;
  });
  protected readonly blockedSave = computed(() => {
    const d = this.draft();
    return d ? saveBlocker(d) : null;
  });

  constructor() {
    // Follow the saved exposure, unless the admin has unsaved changes: those
    // stay, and a newer version shows as a conflict instead.
    effect(() => {
      const e = this.exposure();
      if (!e) return;
      const base = untracked(this.baseline);
      if (!base || base.id !== e.id) {
        // A newly opened exposure: start on what matters most in its status.
        if (e.deployment) this.view.set('deployment');
        else if (e.plan && e.status === 'awaiting_confirmation') this.view.set('plan:summary');
      } else if (base.status !== 'deployed' && e.status === 'deployed') {
        // The deploy the admin is watching finished.
        this.view.set('deployment');
      }
      if (!base || base.id !== e.id || !untracked(this.dirty)) this.reset(e);
    });
  }

  private reset(e: ExposureDetail): void {
    this.draft.set(draftFrom(e));
    this.baseline.set(e);
    this.saveErrors.set({});
    this.saveMessage.set(null);
  }

  protected move(request: MoveRequest): void {
    const d = this.draft();
    if (!d || !this.editable()) return;
    this.saveMessage.set(null);
    this.draft.set(request.to === 'new' ? moveToNewGroup(d, request.serviceId) : moveService(d, request.serviceId, request.to, request.index));
  }

  protected addEmptyGroup(): void {
    const d = this.draft();
    if (d) this.draft.set(addGroup(d).draft);
  }

  protected removeEmptyGroup(key: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set(removeGroup(d, key));
    if (this.view() === this.groupView(key)) this.view.set('board');
  }

  protected discard(): void {
    const e = this.exposure();
    if (e) this.reset(e);
  }

  protected saveGrouping(): void {
    const d = this.draft();
    if (!d) return;
    this.saveMessage.set(null);
    this.save.mutate(toRequest(d), {
      onSuccess: (saved) => this.reset(saved),
      onError: (err) => {
        const error = apiError(err);
        if (error.httpStatus === 409) {
          this.saveMessage.set(`Not saved: ${error.message}. Reload to see the exposure as it is now.`);
        } else if (error.errors?.length) {
          const byService: Record<string, string[]> = {};
          for (const n of error.errors) if (n.service_id) (byService[n.service_id] ??= []).push(n.message);
          this.saveErrors.set(byService);
          this.saveMessage.set(`Not saved: ${error.message}. The cards in red say why.`);
        } else {
          this.saveMessage.set(`Not saved: ${error.message}.`);
        }
      }
    });
  }

  // ---- Fixing a blocker: a registry entry's URL --------------------------------

  /** The registry entry whose URL is being set, by its id. */
  protected readonly editingUrl = signal<string | null>(null);
  protected readonly urlError = signal<string | null>(null);

  protected isEditingUrl(entryId: string): boolean {
    return this.editingUrl() === entryId;
  }

  protected openUrlForm(entryId: string): void {
    this.urlError.set(null);
    this.editingUrl.set(entryId);
  }

  protected closeUrlForm(): void {
    this.editingUrl.set(null);
    this.urlError.set(null);
  }

  protected saveUrl(entryId: string, url: string): void {
    this.urlError.set(null);
    this.setUrl.mutate(
      { entryId, url },
      {
        onSuccess: () => this.closeUrlForm(),
        onError: (err) => this.urlError.set(apiError(err).message)
      }
    );
  }

  /** The registry entry whose missing URL a blocker names, when it does. */
  protected entryToFix(e: ExposureDetail, n: ExposureNotice): string | null {
    if (n.code !== 'published_url_missing') return null;
    return e.services.find((s) => s.id === n.service_id)?.registry_entry?.id ?? null;
  }

  // ---- What the panes show ---------------------------------------------------

  protected readonly eventsNewestFirst = computed(() =>
    [...this.stream.events()].reverse().map((event) => ({
      ...describeEvent(event),
      seq: event.seq,
      actor: event.actor,
      iso: new Date(event.ts).toISOString(),
      when: formatDate(event.ts, 'MMM d, y · HH:mm:ss', 'en-US')
    }))
  );
  protected readonly streamLabel = computed(
    () => ({ connecting: 'Connecting', live: 'Live', reconnecting: 'Reconnecting', ended: 'Complete' })[this.stream.state()]
  );
  protected readonly streamPill = computed(
    () =>
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ' +
      {
        connecting: 'border-border text-fg-subtle',
        live: 'border-ok-line bg-ok-bg text-ok',
        reconnecting: 'border-warn-line bg-warn-bg text-warn',
        ended: 'border-border text-fg-muted'
      }[this.stream.state()]
  );

  private readonly blockedServices = computed(
    () =>
      new Set(
        (this.exposure()?.blocked_by ?? [])
          .filter((n) => n.code !== 'service_ungrouped')
          .map((n) => n.service_id)
          .filter((id) => id !== null)
      )
  );

  /** The draft's groups, as the left pane lists them. */
  protected readonly sideGroups = computed(() => {
    const e = this.exposure();
    const d = this.draft();
    if (!e || !d) return [];
    const byId = new Map(e.services.map((s) => [s.id, s]));
    return d.groups.map((g, i) => {
      const hosts = [...new Set(g.serviceIds.map((id) => byId.get(id)?.host.split('.')[0]).filter(Boolean))].join(', ');
      return {
        key: g.key,
        number: i + 1,
        hosts,
        label: hosts ? `VIP ${i + 1} · ${hosts}` : `VIP ${i + 1}`,
        count: g.serviceIds.length,
        blocked: g.serviceIds.some((id) => this.blockedServices().has(id) || !!this.saveErrors()[id])
      };
    });
  });

  protected readonly selectedGroup = computed(() => {
    const view = this.view();
    return view.startsWith('group:') ? this.sideGroups().find((g) => `group:${g.key}` === view) : undefined;
  });

  protected readonly published = computed(
    () => this.exposure()?.services.filter((s) => s.scope === 'published' || s.scope === 'unresolved') ?? []
  );
  protected readonly publishedBlocked = computed(() => this.published().some((s) => this.blockedServices().has(s.id)));
  protected readonly excluded = computed(() => this.exposure()?.services.filter((s) => s.scope === 'excluded') ?? []);
  /** Blockers about the whole exposure, which no card shows. */
  protected readonly appBlockers = computed(() => this.exposure()?.blocked_by.filter((n) => !n.service_id) ?? []);

  /** The header's facts, each with its icon; the label is for screen readers. */
  protected readonly meta = computed(() => {
    const e = this.exposure();
    if (!e) return [];
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
      { label: 'App URL', icon: Globe, text: e.app.url, mono: true },
      { label: 'Scan', icon: Radar, text: e.scan_id.slice(0, 8), mono: true, title: e.scan_id },
      { label: 'Submitted by', icon: User, text: e.submitted_by },
      { label: 'Submitted', icon: Clock, text: formatDate(e.submitted_at, 'MMM d, y · HH:mm', 'en-US') }
    ];
    if (e.deployment) items.push({ label: 'Public URL', icon: Rocket, text: e.deployment.public_url, mono: true });
    if (e.supersedes) items.push({ label: 'Replaces', icon: GitCompareArrows, prefix: 'replaces', link: e.supersedes });
    if (e.superseded_by) items.push({ label: 'Replaced by', icon: GitCompareArrows, prefix: 'replaced by', link: e.superseded_by });
    return items;
  });

  protected readonly origin = formatOrigin;
  protected readonly primaryButton =
    'inline-flex items-center gap-1.5 rounded-md bg-ok px-3.5 py-1.5 text-[13px] font-medium text-white shadow-card transition-opacity disabled:cursor-not-allowed disabled:opacity-50';
  protected readonly secondaryButton =
    'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2';

  protected readonly icons = {
    ArrowLeft,
    ArrowRight,
    Ban,
    CircleDashed,
    FileText,
    GitCompareArrows,
    Globe,
    Play,
    RotateCcw,
    Server,
    EyeOff,
    Info,
    LayoutGrid,
    OctagonAlert,
    RefreshCw,
    Rocket,
    ScrollText,
    Share2
  };

  protected groupView(key: string): View {
    return `group:${key}`;
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
  protected readonly linkButton =
    'shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 font-sans text-xs font-medium text-accent hover:bg-surface-2';
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

  protected vipBadge(blocked: boolean): string {
    return (
      'grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ring-1 ring-inset ' +
      (blocked ? 'bg-danger-bg text-danger ring-danger-line' : 'bg-surface text-fg-muted ring-border')
    );
  }

  protected eventDot(tone: EventTone): string {
    return (
      'absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-bg ' +
      { neutral: 'bg-fg-subtle', accent: 'bg-accent', ok: 'bg-ok', danger: 'bg-danger', muted: 'bg-border' }[tone]
    );
  }
}
