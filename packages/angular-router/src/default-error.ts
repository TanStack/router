import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ERROR_COMPONENT_CONTEXT } from './route';

@Component({
  selector: 'default-error,DefaultError',
  template: `
    <div style="display: flex; align-items: center; gap: 0.5rem">
      <strong style="font-size: 1rem">Something went wrong!</strong>
      <button
        style="appearance: none; font-size: 0.6em; border: 1px solid currentColor; padding: 0.1rem 0.2rem; font-weight: bold; border-radius: 0.25rem"
        (click)="show.set(!show())"
      >
        {{ show() ? 'Hide Error' : 'Show Error' }}
      </button>
    </div>
    <div style="height: 0.25rem"></div>
    @if (show()) {
      <div>
        <pre
          style="font-size: 0.7em; border: 1px solid red; border-radius: 0.25rem; padding: 0.3rem; color: red; overflow: auto"
        >
          @if (context.error.message; as message) {
            <code>{{ message }}</code>
          }
        </pre>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 0.5rem;
      max-width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultError {
  protected context = inject(ERROR_COMPONENT_CONTEXT);
  protected show = signal(false);
}
