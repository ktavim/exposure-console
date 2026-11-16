import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ArrowRight, CircleCheck, ExternalLink, LucideAngularModule } from 'lucide-angular';
import type { ExposureDetail } from '@core/models';

/**
 * A deployed exposure (docs/exposure-design.md, Console: `deployed`): where
 * outside browsers reach the app, who approved it, and the references the
 * deploy left on the F5, in DNS and in the published-origins registry.
 */
@Component({
  selector: 'app-deployment',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (exposure().deployment; as d) {
      <h2 id="detail-heading" [class]="title">Deployed</h2>
      <p [class]="subtitle">{{ when() }}</p>

      <div class="mb-6 flex items-center gap-4 rounded-xl border border-ok-line bg-ok-bg px-5 py-4">
        <span class="grid size-9 shrink-0 place-items-center rounded-full bg-ok text-white" aria-hidden="true">
          <lucide-icon [img]="icons.CircleCheck" [size]="18" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] text-fg-muted">Outside the internal network, the app is at</p>
          <a [href]="d.public_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-mono text-[15px] font-medium text-ok hover:underline">
            {{ d.public_url }}<lucide-icon [img]="icons.ExternalLink" [size]="13" aria-hidden="true" />
          </a>
          <p class="mt-0.5 text-[13px] text-fg-muted">Inside, nothing changed: users reach <span class="font-mono text-[12.5px]">{{ exposure().app.url }}</span> as before.</p>
        </div>
      </div>

      <h3 [class]="section">On the F5 · partition <span class="font-mono font-normal">{{ d.partition }}</span></h3>
      <ul class="mb-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        @for (vs of d.virtual_servers; track vs) {
          <li class="border-t border-border-soft px-4 py-2 font-mono text-[12.5px] first:border-t-0">{{ vs }}</li>
        }
      </ul>

      <h3 [class]="section">DNS records</h3>
      <div [class]="tableWrap" class="mb-6">
        <table class="w-full text-left">
          <thead [class]="thead"><tr><th [class]="th">Name</th><th [class]="th">Type</th><th [class]="th">Target</th><th [class]="th">Record</th></tr></thead>
          <tbody>
            @for (r of d.dns_records; track r.name) {
              <tr [class]="tr">
                <td [class]="td" class="font-mono text-[12.5px]">{{ r.name }}</td>
                <td [class]="td">{{ r.type }}</td>
                <td [class]="td" class="font-mono text-[12.5px]">{{ r.target }}</td>
                <td [class]="td" class="font-mono text-xs text-fg-muted">{{ r.id ?? '—' }}</td>
              </tr>
            } @empty {
              <tr><td [class]="td" colspan="4" class="text-fg-subtle">None: the app's name was already there.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <h3 [class]="section">Registered as published</h3>
      <p class="-mt-1 mb-2 text-[13px] text-fg-muted">Other apps that call these origins get them in their rewrite map, with no VIP of their own.</p>
      <div [class]="tableWrap">
        <table class="w-full text-left">
          <thead [class]="thead">
            <tr><th [class]="th">Origin</th><th class="w-8"><span class="sr-only">published at</span></th><th [class]="th">Published at</th></tr>
          </thead>
          <tbody>
            @for (r of d.registered; track r.origin) {
              <tr [class]="tr">
                <td [class]="td" class="font-mono text-[12.5px] text-fg-muted">{{ r.origin }}</td>
                <td class="text-fg-subtle"><lucide-icon [img]="icons.ArrowRight" [size]="14" aria-hidden="true" /></td>
                <td [class]="td" class="font-mono text-[12.5px]">{{ r.url }}</td>
              </tr>
            }
            @for (r of d.already_registered; track r.origin) {
              <tr [class]="tr">
                <td [class]="td" class="font-mono text-[12.5px] text-fg-muted">{{ r.origin }}</td>
                <td class="text-fg-subtle"><lucide-icon [img]="icons.ArrowRight" [size]="14" aria-hidden="true" /></td>
                <td [class]="td" class="text-[13px] text-warn">
                  Registered by someone else meanwhile{{ r.url ? ', at ' + r.url : '' }}; that entry stands.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `
})
export class DeploymentComponent {
  readonly exposure = input.required<ExposureDetail>();

  protected readonly when = computed(() => {
    const e = this.exposure();
    const at = (iso: string | null) => (iso ? formatDate(iso, 'MMM d, y · HH:mm', 'en-US') : '?');
    return `Live since ${at(e.deployed_at)}. Confirmed by ${e.confirmed_by ?? '?'} on ${at(e.confirmed_at)}.`;
  });

  protected readonly icons = { ArrowRight, CircleCheck, ExternalLink };
  protected readonly title = 'text-lg font-semibold tracking-tight';
  protected readonly subtitle = 'mb-5 mt-0.5 text-[13px] text-fg-muted';
  protected readonly section = 'mb-2 text-[13px] font-semibold';
  protected readonly tableWrap = 'overflow-hidden rounded-xl border border-border bg-surface shadow-card';
  protected readonly thead = 'border-b border-border bg-surface-2 text-xs text-fg-muted';
  protected readonly th = 'px-4 py-2.5 font-medium';
  protected readonly tr = 'border-t border-border-soft transition-colors first:border-t-0 hover:bg-surface-2';
  protected readonly td = 'px-4 py-2.5 align-middle';
}
