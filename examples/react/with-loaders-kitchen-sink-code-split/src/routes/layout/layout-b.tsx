import { Route } from '@tanstack/router'
import * as React from 'react'
import { layoutRoute } from '.'

export const layoutRouteB = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
  component: LayoutB,
})

function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  )
}
