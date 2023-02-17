import * as React from 'react'
import { Router } from '@tanstack/router'

import { routeConfig } from './routes.generated/routeConfig'
import { Spinner } from './components/Spinner'

export const router = new Router({
  routeConfig: routeConfig,
  defaultPreload: 'intent',
  // useServerData: true,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}
