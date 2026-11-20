import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * An inline form for one URL: a field, Save and Cancel. The parent saves the
 * value and passes back `pending` and `error`; the server's validation is the
 * one that counts, so the field only checks that something was typed.
 */
@Component({
  selector: 'app-url-form',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-wrap items-start gap-2" (ngSubmit)="submit()">
      <div class="min-w-64 flex-1">
        <input
          #field
          type="url"
          name="url"
          class="w-full rounded-md border bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-bg"
          [class]="error() ? 'border-danger' : 'border-border'"
          [placeholder]="placeholder()"
          [attr.aria-label]="label()"
          [attr.aria-invalid]="!!error()"
          [(ngModel)]="value"
          [disabled]="pending()"
          (keydown.escape)="cancelled.emit()"
        />
        @if (error()) {
          <p class="mt-1 text-xs text-danger" role="alert">{{ error() }}</p>
        }
      </div>
      <button
        type="submit"
        class="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
        [disabled]="pending() || !value().trim()"
      >
        {{ pending() ? 'Saving…' : 'Save' }}
      </button>
      <button type="button" class="rounded-md px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-border-soft hover:text-fg" (click)="cancelled.emit()">
        Cancel
      </button>
    </form>
  `
})
export class UrlFormComponent {
  readonly label = input.required<string>();
  readonly placeholder = input('https://');
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<string>();
  readonly cancelled = output<void>();

  protected readonly value = signal('');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    afterNextRender(() => this.field().nativeElement.focus());
  }

  protected submit(): void {
    const url = this.value().trim();
    if (url && !this.pending()) this.saved.emit(url);
  }
}
