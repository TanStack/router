import * as React from 'react'
import { routeConfig } from '../routes.generated/index'

routeConfig.generate({
  component: () => (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  ),
})
