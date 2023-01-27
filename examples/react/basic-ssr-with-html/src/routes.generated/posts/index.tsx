import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from '../posts'
import * as React from 'react'
const routeConfig = new Route({
  getParentRoute: () => parentRouteConfig,
  path: '/',
  component: () => <div>Select a post.</div>,
})
export { routeConfig }
