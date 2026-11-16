import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule, Monitor, Moon, Network, Sun } from 'lucide-angular';
import { type Theme, ThemeService } from '@core/theme.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-screen' },
  template: `
    <header class="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-side px-5">
      <a routerLink="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
        <span class="grid size-7 place-items-center rounded-lg bg-accent text-white shadow-sm">
          <lucide-icon [img]="icons.Network" [size]="16" aria-hidden="true" />
        </span>
        Exposure Console
      </a>
      <nav class="flex h-full items-stretch gap-1" aria-label="Main">
        @for (link of links; track link.path) {
          <a
            [routerLink]="link.path"
            routerLinkActive="!text-fg after:!bg-accent"
            [routerLinkActiveOptions]="{ exact: link.path === '/' }"
            class="relative flex items-center px-3 font-medium text-fg-muted transition-colors hover:text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent"
            >{{ link.label }}</a
          >
        }
      </nav>
      <div class="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Theme">
        @for (option of themes; track option.value) {
          <button
            type="button"
            class="grid size-7 place-items-center rounded-md transition-colors"
            [class]="theme.theme() === option.value ? 'bg-border-soft text-fg' : 'text-fg-subtle hover:text-fg'"
            [attr.aria-pressed]="theme.theme() === option.value"
            [attr.aria-label]="option.label + ' theme'"
            [title]="option.label + ' theme'"
            (click)="theme.theme.set(option.value)"
          >
            <lucide-icon [img]="option.icon" [size]="15" aria-hidden="true" />
          </button>
        }
      </div>
    </header>
    <main class="flex-1 min-h-0 overflow-auto">
      <router-outlet />
    </main>
  `
})
export class ShellComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly icons = { Network };
  protected readonly links = [
    { path: '/', label: 'Queue' },
    { path: '/history', label: 'History' }
  ];
  protected readonly themes: { value: Theme; label: string; icon: typeof Monitor }[] = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ];
}
