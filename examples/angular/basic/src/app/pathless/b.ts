import { Component } from "@angular/core"
import { createRoute } from '@tanstack/angular-router'

import { nestedPathlessLayout2Route } from "./nested"

export const pathlessLayoutBRoute = createRoute({
  getParentRoute: () => nestedPathlessLayout2Route,
  path: '/route-b',
  component: () => PathlessLayoutB,
})

@Component({
  template: `
    <div>I'm route B!</div>
  `
})
export class PathlessLayoutB {}
