import { Component } from '@angular/core'
import { Outlet, createRoute } from '@tanstack/angular-router'

import { rootRoute } from '../root'

export const pathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_pathlessLayout',
  component: () => PathlessLayout,
})

@Component({
  imports: [Outlet],
  template: `
    <div class="p-2">
      <div class="border-b">I'm a pathless layout</div>
      <div>
        <outlet />
      </div>
    </div>
  `,
})
export class PathlessLayout {}
