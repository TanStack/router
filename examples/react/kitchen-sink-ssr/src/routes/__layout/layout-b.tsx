import * as React from 'react'
import { routeConfig } from '../../routes.generated/__layout/layout-b'

routeConfig.generate({
  component: LayoutB,
})

function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  )
}
