import * as Angular from '@angular/core'

// This mimicks the waiting of heavy dependencies, which need to be streamed in before the component is available.
await new Promise((resolve) => setTimeout(resolve, 2500))

@Angular.Component({
  template: '<h1>I am sooo heavy</h1>',
  standalone: true,
})
class HeavyComponent {}

export default HeavyComponent
