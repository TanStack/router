// Generouted, changes to this file will be overriden
import { Fragment } from 'react'
import { ActionClient } from '@tanstack/react-actions'
import { LoaderClient } from '@tanstack/react-loaders'
import { lazy, Outlet, ReactRouter, RootRoute, Route, RouterProvider } from '@tanstack/react-router'

import App from '@/pages/_app'
import { Loader as layoutLoader, Config as layoutConfig } from '@/pages/layout/_layout'
import { Loader as dashboardLoader, Config as dashboardConfig } from '@/pages/dashboard/_layout'
import {
  Action as dashboardInvoicesInvoiceIdAction,
  Loader as dashboardInvoicesInvoiceIdLoader,
  Config as dashboardInvoicesInvoiceIdConfig,
} from '@/pages/dashboard/invoices/[invoiceId]'
import { Action as dashboardInvoicesIndexAction } from '@/pages/dashboard/invoices/index'
import { Loader as dashboardUsersLoader, Config as dashboardUsersConfig } from '@/pages/dashboard/users/_layout'
import {
  Loader as dashboardUsersUserIdLoader,
  Config as dashboardUsersUserIdConfig,
} from '@/pages/dashboard/users/[userId]'

const root = new RootRoute({ component: App || Outlet })
const _404 = new Route({
  getParentRoute: () => root,
  path: '*',
  component: Fragment,
})
const layout = new Route({
  getParentRoute: () => root,
  path: 'layout',
  component: lazy(() => import('./pages/layout/_layout')),
  ...layoutConfig,
})
const layoutlayoutb = new Route({
  getParentRoute: () => layout,
  path: 'layout-b',
  component: lazy(() => import('./pages/layout/layout-b')),
})
const layoutlayouta = new Route({
  getParentRoute: () => layout,
  path: 'layout-a',
  component: lazy(() => import('./pages/layout/layout-a')),
})
const dashboard = new Route({
  getParentRoute: () => root,
  path: 'dashboard',
  component: lazy(() => import('./pages/dashboard/_layout')),
  ...dashboardConfig,
})
const dashboardindex = new Route({
  getParentRoute: () => dashboard,
  path: '/',
  component: lazy(() => import('./pages/dashboard/index')),
})
const dashboardusers = new Route({
  getParentRoute: () => dashboard,
  path: 'users',
  component: lazy(() => import('./pages/dashboard/users/_layout')),
  ...dashboardUsersConfig,
})
const dashboardusersindex = new Route({
  getParentRoute: () => dashboardusers,
  path: '/',
  component: lazy(() => import('./pages/dashboard/users/index')),
})
const dashboardusersuserId = new Route({
  getParentRoute: () => dashboardusers,
  path: '$userId',
  component: lazy(() => import('./pages/dashboard/users/[userId]')),
  ...dashboardUsersUserIdConfig,
})
export const dashboardinvoices = new Route({
  getParentRoute: () => dashboard,
  path: 'invoices',
  component: lazy(() => import('./pages/dashboard/invoices/_layout')),
})
const dashboardinvoicesindex = new Route({
  getParentRoute: () => dashboardinvoices,
  path: '/',
  component: lazy(() => import('./pages/dashboard/invoices/index')),
})
export const dashboardinvoicesinvoiceId = new Route({
  getParentRoute: () => dashboardinvoices,
  path: '$invoiceId',
  component: lazy(() => import('./pages/dashboard/invoices/[invoiceId]')),
  ...dashboardInvoicesInvoiceIdConfig,
})
const authenticated = new Route({
  getParentRoute: () => root,
  path: 'authenticated',
  component: lazy(() => import('./pages/authenticated')),
})
const expensive = new Route({
  getParentRoute: () => root,
  path: 'expensive',
  component: lazy(() => import('./pages/expensive')),
})
const index = new Route({
  getParentRoute: () => root,
  path: '/',
  component: lazy(() => import('./pages/index')),
})

export const routes = root.addChildren([
  layout.addChildren([layoutlayoutb, layoutlayouta]),
  dashboard.addChildren([
    dashboardindex,
    dashboardusers.addChildren([dashboardusersindex, dashboardusersuserId]),
    dashboardinvoices.addChildren([dashboardinvoicesindex, dashboardinvoicesinvoiceId]),
  ]),
  authenticated,
  expensive,
  index,
  _404,
])

const router = new ReactRouter({ routeTree: routes })
export const Routes = () => <RouterProvider router={router} />

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export const actionClient = new ActionClient({
  getActions: () => [dashboardInvoicesInvoiceIdAction, dashboardInvoicesIndexAction],
})

declare module '@tanstack/react-actions' {
  interface Register {
    actionClient: typeof actionClient
  }
}

export const loaderClient = new LoaderClient({
  getLoaders: () => [
    layoutLoader,
    dashboardLoader,
    dashboardInvoicesInvoiceIdLoader,
    dashboardUsersLoader,
    dashboardUsersUserIdLoader,
  ],
})

declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}
