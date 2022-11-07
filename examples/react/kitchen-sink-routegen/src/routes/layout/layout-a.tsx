import * as React from 'react'
import layoutRoute from '../layout'

export default layoutRoute.createRoute({
  path: 'layout-a',
  element: <LayoutA />,
})

function LayoutA() {
  return (
    <div>
      <div>Layout A</div>
    </div>
  )
}
