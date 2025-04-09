// This mimicks the waiting of heavy dependencies, which need to be streamed in before the component is available.
import { Component } from '@angular/core'

await new Promise((resolve) => setTimeout(resolve, 2500))

@Component({
  selector: 'HeavyComponent',
  template: `<h1>I am sooo heavy</h1>`,
})
export class HeavyComponent {}
