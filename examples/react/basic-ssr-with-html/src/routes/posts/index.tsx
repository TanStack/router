import * as React from 'react'
import { routeConfig } from '../../routes.generated/posts/index'

routeConfig.generate({
  component: () => <div>Select a post.</div>,
})
