import * as React from 'react'
import { Router } from '@tanstack/router'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes'
import { dashboardRoute } from './routes/dashboard'
import { expensiveRoute } from './routes/expensive'
import {
  authenticatedIndexRoute,
  authenticatedRoute,
} from './routes/authenticated'
import { layoutRoute } from './routes/layout'
import { dashboardIndexRoute } from './routes/dashboard/dashboard'
import { invoicesRoute } from './routes/dashboard/invoices'
import {
  createInvoiceAction,
  invoicesIndexRoute,
} from './routes/dashboard/invoices/invoices'
import {
  invoiceRoute,
  updateInvoiceAction,
} from './routes/dashboard/invoices/invoice'
import { usersRoute } from './routes/dashboard/users'
import { usersIndexRoute } from './routes/dashboard/users/users'
import { userRoute } from './routes/dashboard/users/user'
import { layoutRouteA } from './routes/layout/layout-a'
import { layoutRouteB } from './routes/layout/layout-b'
import { Spinner } from './components/Spinner'
import { loaderClient } from './loaderClient'

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    usersRoute.addChildren([usersIndexRoute, userRoute]),
  ]),
  expensiveRoute,
  authenticatedRoute.addChildren([authenticatedIndexRoute]),
  layoutRoute.addChildren([layoutRouteA, layoutRouteB]),
])

export type RouterContext = {
  loaderClient: typeof loaderClient
}

export const router = new Router({
  routeTree,
  context: {
    loaderClient,
  },
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
  onRouteChange: () => {
    createInvoiceAction.clear()
    updateInvoiceAction.clear()
  },
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}
