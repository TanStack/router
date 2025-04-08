import { Component } from '@angular/core'
import { createRoute } from '@tanstack/angular-router'

import { nestedPathlessLayout2Route } from './nested'

export const pathlessLayoutARoute = createRoute({
  getParentRoute: () => nestedPathlessLayout2Route,
  path: '/route-a',
  component: () => PathlessLayoutA,
})

@Component({
  template: ` <div>I'm route A!</div> `,
})
export class PathlessLayoutA {}
