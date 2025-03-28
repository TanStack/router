import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'default-not-found',
  template: `
    <p>Page not found</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
})
export class DefaultNotFound {}
