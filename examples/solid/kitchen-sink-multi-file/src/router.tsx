import { SolidRouter } from '@tanstack/solid-router'

import { Spinner } from './components/Spinner'
import { indexRoute } from './routes'
import {
  authenticatedIndexRoute,
  authenticatedRoute,
} from './routes/authenticated'
import { dashboardRoute } from './routes/dashboard'
import { dashboardIndexRoute } from './routes/dashboard/dashboard'
import { invoicesRoute } from './routes/dashboard/invoices'
import {
  invoiceRoute,
  updateInvoiceAction,
} from './routes/dashboard/invoices/invoice'
import {
  createInvoiceAction,
  invoicesIndexRoute,
} from './routes/dashboard/invoices/invoices'
import { usersRoute } from './routes/dashboard/users'
import { userRoute } from './routes/dashboard/users/user'
import { usersIndexRoute } from './routes/dashboard/users/users'
import { expensiveRoute } from './routes/expensive'
import { layoutRoute } from './routes/layout'
import { layoutRouteA } from './routes/layout/layout-a'
import { layoutRouteB } from './routes/layout/layout-b'
import { rootRoute } from './routes/__root'

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

export const router = new SolidRouter({
  routeTree,
  defaultPendingComponent: Spinner,
  onRouteChange: () => {
    createInvoiceAction.clear()
    updateInvoiceAction.clear()
  },
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}
