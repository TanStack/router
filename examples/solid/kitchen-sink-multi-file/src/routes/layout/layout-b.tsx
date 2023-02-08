import { Route } from '@tanstack/solid-router'
import { layoutRoute } from '.'

export function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  )
}

export const layoutRouteB = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
  component: LayoutB,
})
