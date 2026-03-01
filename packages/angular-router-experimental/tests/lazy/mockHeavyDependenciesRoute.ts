import * as Angular from '@angular/core'

// Mimics heavy dependencies that need to be streamed in before the component is available.
await new Promise((resolve) => setTimeout(resolve, 50))

@Angular.Component({
  template: '<h1>I am sooo heavy</h1>',
  standalone: true,
})
class HeavyComponent { }

export default HeavyComponent
