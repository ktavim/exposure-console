import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'exposure-console.theme';

/** The admin's theme: the system's unless they pick one, remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(ThemeService.stored());

  constructor() {
    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      if (theme === 'system') delete root.dataset['theme'];
      else root.dataset['theme'] = theme;
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        // Storage can be unavailable; the choice then lasts until reload.
      }
    });
  }

  private static stored(): Theme {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
