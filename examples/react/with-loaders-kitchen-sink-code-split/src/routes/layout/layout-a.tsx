import { Route } from '@tanstack/router'
import * as React from 'react'
import { layoutRoute } from '.'

export const layoutRouteA = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
  component: LayoutA,
})

function LayoutA() {
  return (
    <div>
      <div>Layout A</div>
    </div>
  )
}
