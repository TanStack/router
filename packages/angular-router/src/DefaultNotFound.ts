import * as Angular from '@angular/core'

@Angular.Component({
  template: `<p>Not found</p>`,
  changeDetection: Angular.ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
})
export class DefaultNotFoundComponent {}
