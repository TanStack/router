import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  template: `<p>Not found</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
})
export class DefaultNotFoundComponent {}
