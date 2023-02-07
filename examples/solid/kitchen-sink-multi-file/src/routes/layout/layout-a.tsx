import { Route } from '@tanstack/solid-router'
import { layoutRoute } from '.'

export const layoutRouteA = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
  component: () => <LayoutA />,
})

function LayoutA() {
  return (
    <div>
      <div>Layout A</div>
    </div>
  )
}
