import { Component } from '@angular/core'
import { Link, Outlet, createRoute } from '@tanstack/angular-router'
import { pathlessLayoutRoute } from './a-layout'

export const nestedPathlessLayout2Route = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  id: '_nestedPathlessLayout',
  component: () => PathlessLayout2,
})

@Component({
  imports: [Outlet, Link],
  template: `
    <div>
      <div>I'm a nested pathless layout</div>
      <div className="flex gap-2 border-b">
        <a [link]="{ to: '/route-a' }" linkActive="font-bold">
          Go to Route A
        </a>
        <a [link]="{ to: '/route-b' }" linkActive="font-bold">
          Go to Route B
        </a>
      </div>
      <div>
        <outlet />
      </div>
    </div>  
  `
})
export class PathlessLayout2 {}