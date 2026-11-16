import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ArrowRight, Copy, LockKeyhole, LucideAngularModule } from 'lucide-angular';
import type { Plan } from '@core/models';

/** Which part of the plan the pane shows, as the left pane lists them. */
export type PlanPart = 'summary' | 'app' | 'diff' | 'declaration' | `vip:${number}`;

/**
 * The plan the admin approves (docs/exposure-console-ui.md, Plan review):
 * laid out like a pull request's changed files, one part at a time.
 */
@Component({
  selector: 'app-plan-review',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('summary') {
        <h2 id="detail-heading" [class]="title">What deploying does</h2>
        <p [class]="subtitle">
          Reserved and installed while planning; posted, verified and published in DNS only on deploy.
          Partition <span class="font-mono text-[12.5px]">{{ plan().partition }}</span>.
        </p>
        <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div [class]="card">
            <div [class]="cardLabel">On the F5</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              <span class="text-ok">+{{ plan().summary.add }}</span>
              <span class="ml-2 text-warn">~{{ plan().summary.change }}</span>
              <span class="ml-2 text-fg-subtle">−{{ plan().summary.destroy }}</span>
            </div>
          </div>
          <div [class]="card"><div [class]="cardLabel">IPs reserved</div><div [class]="cardValue">{{ plan().summary.ips }}</div></div>
          <div [class]="card"><div [class]="cardLabel">DNS names</div><div [class]="cardValue">{{ plan().summary.dns }}</div></div>
          <div [class]="card"><div [class]="cardLabel">Certificates</div><div [class]="cardValue">{{ plan().summary.certificates }}</div></div>
        </div>
        <h3 class="mb-2 text-[13px] font-semibold">DNS records, created after the deploy verifies</h3>
        <div [class]="tableWrap">
          <table class="w-full text-left">
            <thead [class]="thead"><tr><th [class]="th">Name</th><th [class]="th">Type</th><th [class]="th">Target</th><th [class]="th">VIP</th></tr></thead>
            <tbody>
              @for (r of plan().dns_records; track r.name) {
                <tr [class]="tr">
                  <td [class]="td" class="font-mono text-[12.5px]">{{ r.name }}</td>
                  <td [class]="td">{{ r.type }}</td>
                  <td [class]="td" class="font-mono text-[12.5px]">{{ r.target }}</td>
                  <td [class]="td" class="text-fg-muted">{{ vipOf(r.target) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @case ('vip') {
        @if (vip(); as v) {
          <h2 id="detail-heading" [class]="title">VIP {{ vipIndex() + 1 }} <span class="font-mono text-base font-normal text-fg-muted">{{ v.ip }}</span></h2>
          <p [class]="subtitle">One virtual server, HTTPS on 443, routing by the Host header to each service's pool.</p>
          <div class="mb-4 flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] shadow-card">
            <lucide-icon [img]="icons.LockKeyhole" [size]="16" class="mt-0.5 text-fg-subtle" aria-hidden="true" />
            <div>
              Certificate <span class="font-mono text-[12.5px]">{{ v.certificate.name }}</span>, expires {{ v.certificate.expires }}, for
              @for (n of v.certificate.names; track n; let last = $last) {
                <span class="font-mono text-[12.5px]">{{ n }}</span>{{ last ? '.' : ', ' }}
              }
            </div>
          </div>
          <div [class]="tableWrap">
            <table class="w-full text-left">
              <thead [class]="thead">
                <tr><th [class]="th">Original origin</th><th class="w-8"><span class="sr-only">replaced by</span></th><th [class]="th">Replaced by</th><th [class]="th">Pool</th></tr>
              </thead>
              <tbody>
                @for (s of v.services; track s.service_id) {
                  <tr [class]="tr">
                    <td [class]="td" class="font-mono text-[12.5px] text-fg-muted">{{ s.original }}</td>
                    <td class="text-fg-subtle"><lucide-icon [img]="icons.ArrowRight" [size]="14" aria-hidden="true" /></td>
                    <td [class]="td" class="font-mono text-[12.5px]">{{ s.url }}</td>
                    <td [class]="td" class="font-mono text-xs text-fg-muted">
                      {{ s.pool_scheme }} · {{ s.pool.join(', ') }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
      @case ('app') {
        <h2 id="detail-heading" [class]="title">App VIP · rewrite map</h2>
        <p [class]="subtitle">
          <span class="font-mono text-[12.5px]">{{ plan().app.public_url }}</span> at
          <span class="font-mono text-[12.5px]">{{ plan().app.ip }}</span>
          {{ plan().app.existing ? 'is deployed already; this plan changes its rewrite map.' : 'is new.' }}
          The F5 replaces each original origin in the app's responses with the URL that publishes it.
        </p>
        <div [class]="tableWrap">
          <table class="w-full text-left">
            <thead [class]="thead">
              <tr><th [class]="th">Original origin</th><th class="w-8"><span class="sr-only">rewritten to</span></th><th [class]="th">Rewritten to</th><th [class]="th">From</th></tr>
            </thead>
            <tbody>
              @for (r of plan().rewrite; track r.original) {
                <tr [class]="tr">
                  <td [class]="td" class="font-mono text-[12.5px] text-fg-muted">{{ r.original }}</td>
                  <td class="text-fg-subtle"><lucide-icon [img]="icons.ArrowRight" [size]="14" aria-hidden="true" /></td>
                  <td [class]="td" class="font-mono text-[12.5px]">{{ r.url }}</td>
                  <td [class]="td">
                    <span [class]="r.source === 'published' ? publishedPill : newPill">{{ sourceLabel[r.source] }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @case ('diff') {
        <h2 id="detail-heading" [class]="title">Dry-run diff</h2>
        <p [class]="subtitle">What posting the declaration changes in the partition, against what is deployed there now.</p>
        <div class="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div class="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2 text-[13px]">
            <span class="font-mono font-medium">{{ plan().partition }}</span>
            <span class="flex-1 text-fg-subtle">tenant</span>
            <span class="font-medium text-ok">+{{ added() }}</span>
            <span class="font-medium text-danger">−{{ removed() }}</span>
          </div>
          <div class="overflow-x-auto font-mono text-xs leading-5">
            @for (line of numbered(); track $index) {
              <div class="grid grid-cols-[3rem_1.25rem_1fr] whitespace-pre" [class]="lineClass(line.op)">
                <span class="select-none pr-2 text-right text-fg-subtle">{{ line.number }}</span>
                <span class="select-none text-fg-subtle">{{ line.op === '@' ? '' : line.op }}</span>
                <span>{{ line.text }}</span>
              </div>
            }
          </div>
        </div>
      }
      @case ('declaration') {
        <div class="flex items-center gap-3">
          <h2 id="detail-heading" [class]="title">Declaration</h2>
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
            (click)="copy()"
          >
            <lucide-icon [img]="icons.Copy" [size]="13" aria-hidden="true" />{{ copied() ? 'Copied' : 'Copy JSON' }}
          </button>
        </div>
        <p [class]="subtitle">The AS3 declaration the deploy posts, rendered by the agent from its own template. Certificates are referred to by name; their keys are only on the F5.</p>
        <pre class="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface p-4 font-mono text-xs leading-5 shadow-card">{{ json() }}</pre>
      }
    }
  `
})
export class PlanReviewComponent {
  readonly plan = input.required<Plan>();
  readonly part = input<PlanPart>('summary');

  protected readonly icons = { ArrowRight, Copy, LockKeyhole };
  protected readonly copied = signal(false);

  protected readonly kind = computed(() => (this.part().startsWith('vip:') ? 'vip' : this.part()));
  protected readonly vipIndex = computed(() => Number(this.part().split(':')[1] ?? 0));
  protected readonly vip = computed(() => this.plan().vips[this.vipIndex()]);
  protected readonly json = computed(() => JSON.stringify(this.plan().declaration, null, 2));
  protected readonly added = computed(() => this.plan().diff.filter((l) => l.op === '+').length);
  protected readonly removed = computed(() => this.plan().diff.filter((l) => l.op === '-').length);

  /** The diff with each line's number in the new declaration; removed lines and hunk headers get none. */
  protected readonly numbered = computed(() => {
    let n = 0;
    return this.plan().diff.map((line) => {
      if (line.op === '@') {
        const start = /\+(\d+)/.exec(line.text);
        n = start ? Number(start[1]) - 1 : n;
        return { ...line, number: '' };
      }
      return { ...line, number: line.op === '-' ? '' : String(++n) };
    });
  });

  protected vipOf(ip: string): string {
    if (ip === this.plan().app.ip) return 'the app';
    const i = this.plan().vips.findIndex((v) => v.ip === ip);
    return i >= 0 ? `VIP ${i + 1}` : '';
  }

  protected lineClass(op: string): string {
    return { '+': 'bg-ok-bg', '-': 'bg-danger-bg', '@': 'bg-accent-bg text-fg-muted', ' ': '' }[op] ?? '';
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.json()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  protected readonly title = 'text-lg font-semibold tracking-tight';
  protected readonly subtitle = 'mb-5 mt-0.5 text-[13px] text-fg-muted';
  protected readonly card = 'rounded-xl border border-border bg-surface px-4 py-3 shadow-card';
  protected readonly cardLabel = 'text-xs text-fg-muted';
  protected readonly cardValue = 'mt-1 text-2xl font-semibold tabular-nums tracking-tight';
  protected readonly tableWrap = 'overflow-hidden rounded-xl border border-border bg-surface shadow-card';
  protected readonly thead = 'border-b border-border bg-surface-2 text-xs text-fg-muted';
  protected readonly th = 'px-4 py-2.5 font-medium';
  protected readonly tr = 'border-t border-border-soft transition-colors first:border-t-0 hover:bg-surface-2';
  protected readonly td = 'px-4 py-2.5 align-middle';
  protected readonly sourceLabel = { new: 'this plan', published: 'registry', app: 'the app itself' } as const;
  protected readonly newPill = 'rounded-full border border-ok-line bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok';
  protected readonly publishedPill = 'rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted';
}
