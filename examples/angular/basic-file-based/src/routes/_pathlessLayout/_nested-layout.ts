import { Component } from '@angular/core'
import { createFileRoute, Link, Outlet } from '@tanstack/angular-router-experimental'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout')({
  component: () => NestedLayoutComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div>
      <div>I'm a nested pathless layout</div>
      <div class="flex gap-2 border-b">
        <a [link]="{ to: '/route-a', activeProps: { class: 'font-bold' } }">Go to route A</a>
        <a [link]="{ to: '/route-b', activeProps: { class: 'font-bold' } }">Go to route B</a>
      </div>
      <div><outlet /></div>
    </div>
  `,
  imports: [Link, Outlet],
})
class NestedLayoutComponent {}
