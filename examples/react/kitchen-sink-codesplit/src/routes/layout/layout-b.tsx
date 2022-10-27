import * as React from 'react'
import { layoutRoute } from '.'

export const layoutRouteB = layoutRoute.createRoute({
  path: 'layout-b',
  element: <LayoutB />,
})

function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  )
}
