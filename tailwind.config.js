/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        side: 'var(--color-side)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        border: 'var(--color-border)',
        'border-soft': 'var(--color-border-soft)',
        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-subtle': 'var(--color-fg-subtle)',
        accent: 'var(--color-accent)',
        'accent-bg': 'var(--color-accent-bg)',
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        warn: 'var(--color-warn)',
        'warn-bg': 'var(--color-warn-bg)',
        ok: 'var(--color-ok)',
        'ok-bg': 'var(--color-ok-bg)',
        // Borders in each tone's hue, for badges and notes on its soft fill.
        'accent-line': 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
        'danger-line': 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
        'warn-line': 'color-mix(in srgb, var(--color-warn) 35%, transparent)',
        'ok-line': 'color-mix(in srgb, var(--color-ok) 35%, transparent)'
      },
      boxShadow: {
        card: '0 1px 2px rgb(31 35 40 / 0.06), 0 1px 1px rgb(31 35 40 / 0.03)',
        raised: '0 4px 12px rgb(31 35 40 / 0.08), 0 1px 3px rgb(31 35 40 / 0.06)'
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Mono"', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};
