import * as React from 'react'
import { createReactRouter } from '@tanstack/react-router'

import { routeConfig } from './routeConfig.gen'
import { Spinner } from './components/Spinner'

export const router = createReactRouter({
  routeConfig,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
})

declare module '@tanstack/react-router' {
  interface ResolveRouter {
    router: typeof router
  }
}
