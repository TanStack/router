import * as React from 'react'
import { createReactRouter, createRouteConfig } from '@tanstack/react-router'

import { indexRoute } from './routes'
import { dashboardRoute } from './routes/dashboard'
import { expensiveRoute } from './routes/expensive'
import { authenticatedRoute } from './routes/authenticated'
import { layoutRoute } from './routes/layout'
import { dashboardIndexRoute } from './routes/dashboard/dashboard'
import { invoicesRoute } from './routes/dashboard/invoices'
import { usersRoute } from './routes/dashboard/users'
import { invoicesIndexRoute } from './routes/dashboard/invoices/invoices'
import { invoiceRoute } from './routes/dashboard/invoices/invoice'
import { usersIndexRoute } from './routes/dashboard/users/users'
import { userRoute } from './routes/dashboard/users/user'
import { layoutRouteA } from './routes/layout/layout-a'
import { layoutRouteB } from './routes/layout/layout-b'
import { Spinner } from './components/Spinner'

const routeConfig = createRouteConfig().addChildren([
  indexRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    usersRoute.addChildren([usersIndexRoute, userRoute]),
  ]),
  expensiveRoute,
  authenticatedRoute,
  layoutRoute.addChildren([layoutRouteA, layoutRouteB]),
])

export const router = createReactRouter({
  routeConfig,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
})
