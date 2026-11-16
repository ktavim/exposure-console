import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { type Theme, ThemeService } from '@core/theme.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-screen' },
  template: `
    <header class="flex items-center gap-4 border-b border-border bg-side px-5 py-2.5">
      <span class="font-semibold">Exposure Console</span>
      <nav class="flex gap-4" aria-label="Main">
        <a routerLink="/" routerLinkActive="!text-fg font-medium" [routerLinkActiveOptions]="{ exact: true }" class="text-fg-muted hover:text-fg">Queue</a>
        <a routerLink="/history" routerLinkActive="!text-fg font-medium" class="text-fg-muted hover:text-fg">History</a>
      </nav>
      <div class="ml-auto inline-flex overflow-hidden rounded-md border border-border text-xs" role="group" aria-label="Theme">
        @for (option of themes; track option.value) {
          <button
            type="button"
            class="px-2.5 py-1 border-l border-border first:border-l-0"
            [class]="theme.theme() === option.value ? 'bg-accent text-white' : 'bg-surface text-fg'"
            [attr.aria-pressed]="theme.theme() === option.value"
            (click)="theme.theme.set(option.value)"
          >
            {{ option.label }}
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
  protected readonly themes: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];
}
