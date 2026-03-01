import { Component } from '@angular/core'
import { createFileRoute, Outlet } from '@tanstack/angular-router-experimental'

export const Route = createFileRoute('/_pathlessLayout')({
  component: () => PathlessLayoutComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div class="p-2">
      <div class="border-b">I'm a pathless layout</div>
      <div><outlet /></div>
    </div>
  `,
  imports: [Outlet],
})
class PathlessLayoutComponent {}
