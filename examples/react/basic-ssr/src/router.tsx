import * as React from 'react'
import { createMemoryHistory, ReactRouter } from '@tanstack/react-router'
import { routeConfig } from './routes.generated/routeConfig'
import { routeConfigClient } from './routes.generated/routeConfig.client'

export const createRouter = () =>
  new ReactRouter({
    routeConfig: routeConfig,
    // typeof document !== 'undefined' ? routeConfigClient : routeConfig,
    // useServerData: true,
    context: {
      head: '',
    },
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
