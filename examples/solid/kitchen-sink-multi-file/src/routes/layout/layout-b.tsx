import { Route } from '@tanstack/solid-router'
import { layoutRoute } from '.'

export const layoutRouteB = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
  component: () => <LayoutB />,
})

function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  )
}
