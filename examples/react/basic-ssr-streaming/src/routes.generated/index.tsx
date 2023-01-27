import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from './__root'
import * as React from 'react'
const routeConfig = new Route({
  getParentRoute: () => parentRouteConfig,
  path: '/',
  component: () => (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  ),
})
export { routeConfig }
