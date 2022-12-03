import * as React from 'react'
import { routeConfig } from '../routes.generated/index'

routeConfig.generate({
  component: () => (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  ),
})
