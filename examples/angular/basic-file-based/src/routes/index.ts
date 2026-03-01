import { Component } from '@angular/core'
import { createFileRoute } from '@tanstack/angular-router-experimental'

export const Route = createFileRoute('/')({
  component: () => IndexComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div class="p-2">
      <h3>Welcome Home!</h3>
    </div>
  `,
})
class IndexComponent {}
