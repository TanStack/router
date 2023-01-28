import * as React from 'react'
import { ReactRouter } from '@tanstack/react-router'

import { routeConfig } from './routes.generated/routeConfig'
import { Spinner } from './components/Spinner'

export const router = new ReactRouter({
  routeConfig: routeConfig,
  defaultPreload: 'intent',
  // useServerData: true,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
