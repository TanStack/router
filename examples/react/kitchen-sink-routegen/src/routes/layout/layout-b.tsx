import * as React from 'react'
import layoutRoute from '../layout'

export default layoutRoute.createRoute({
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
