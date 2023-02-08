import { Route } from '@tanstack/solid-router'
import { layoutRoute } from '.'

export function LayoutA() {
  return (
    <div>
      <div>Layout A</div>
    </div>
  )
}

export const layoutRouteA = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
  component: LayoutA,
})
