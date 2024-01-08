import { Route as rootRoute } from './routes/__root'
import { Route as LoginImport } from './routes/login'
import { Route as DashboardImport } from './routes/dashboard'
import { Route as LayoutImport } from './routes/_layout'
import { Route as AuthImport } from './routes/_auth'
import { Route as IndexImport } from './routes/index'
import { Route as ExpensiveIndexImport } from './routes/expensive/index'
import { Route as DashboardIndexImport } from './routes/dashboard.index'
import { Route as DashboardUsersImport } from './routes/dashboard.users'
import { Route as DashboardInvoicesImport } from './routes/dashboard.invoices'
import { Route as LayoutLayoutBImport } from './routes/_layout.layout-b'
import { Route as LayoutLayoutAImport } from './routes/_layout.layout-a'
import { Route as AuthProfileImport } from './routes/_auth.profile'
import { Route as DashboardUsersIndexImport } from './routes/dashboard.users.index'
import { Route as DashboardInvoicesIndexImport } from './routes/dashboard.invoices.index'
import { Route as DashboardUsersUserImport } from './routes/dashboard.users.user'
import { Route as DashboardInvoicesInvoiceIdImport } from './routes/dashboard.invoices.$invoiceId'

const LoginRoute = LoginImport.update({
  path: '/login',
  getParentRoute: () => rootRoute,
} as any)

const DashboardRoute = DashboardImport.update({
  path: '/dashboard',
  getParentRoute: () => rootRoute,
} as any)

const LayoutRoute = LayoutImport.update({
  id: '/_layout',
  getParentRoute: () => rootRoute,
} as any)

const AuthRoute = AuthImport.update({
  id: '/_auth',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const ExpensiveIndexRoute = ExpensiveIndexImport.update({
  path: '/expensive/',
  getParentRoute: () => rootRoute,
} as any)

const DashboardIndexRoute = DashboardIndexImport.update({
  path: '/',
  getParentRoute: () => DashboardRoute,
} as any)

const DashboardUsersRoute = DashboardUsersImport.update({
  path: '/users',
  getParentRoute: () => DashboardRoute,
} as any)

const DashboardInvoicesRoute = DashboardInvoicesImport.update({
  path: '/invoices',
  getParentRoute: () => DashboardRoute,
} as any)

const LayoutLayoutBRoute = LayoutLayoutBImport.update({
  path: '/layout-b',
  getParentRoute: () => LayoutRoute,
} as any)

const LayoutLayoutARoute = LayoutLayoutAImport.update({
  path: '/layout-a',
  getParentRoute: () => LayoutRoute,
} as any)

const AuthProfileRoute = AuthProfileImport.update({
  path: '/profile',
  getParentRoute: () => AuthRoute,
} as any)

const DashboardUsersIndexRoute = DashboardUsersIndexImport.update({
  path: '/',
  getParentRoute: () => DashboardUsersRoute,
} as any)

const DashboardInvoicesIndexRoute = DashboardInvoicesIndexImport.update({
  path: '/',
  getParentRoute: () => DashboardInvoicesRoute,
} as any)

const DashboardUsersUserRoute = DashboardUsersUserImport.update({
  path: '/user',
  getParentRoute: () => DashboardUsersRoute,
} as any)

const DashboardInvoicesInvoiceIdRoute = DashboardInvoicesInvoiceIdImport.update(
  {
    path: '/$invoiceId',
    getParentRoute: () => DashboardInvoicesRoute,
  } as any,
)
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/_auth': {
      preLoaderRoute: typeof AuthImport
      parentRoute: typeof rootRoute
    }
    '/_layout': {
      preLoaderRoute: typeof LayoutImport
      parentRoute: typeof rootRoute
    }
    '/dashboard': {
      preLoaderRoute: typeof DashboardImport
      parentRoute: typeof rootRoute
    }
    '/login': {
      preLoaderRoute: typeof LoginImport
      parentRoute: typeof rootRoute
    }
    '/_auth/profile': {
      preLoaderRoute: typeof AuthProfileImport
      parentRoute: typeof AuthImport
    }
    '/_layout/layout-a': {
      preLoaderRoute: typeof LayoutLayoutAImport
      parentRoute: typeof LayoutImport
    }
    '/_layout/layout-b': {
      preLoaderRoute: typeof LayoutLayoutBImport
      parentRoute: typeof LayoutImport
    }
    '/dashboard/invoices': {
      preLoaderRoute: typeof DashboardInvoicesImport
      parentRoute: typeof DashboardImport
    }
    '/dashboard/users': {
      preLoaderRoute: typeof DashboardUsersImport
      parentRoute: typeof DashboardImport
    }
    '/dashboard/': {
      preLoaderRoute: typeof DashboardIndexImport
      parentRoute: typeof DashboardImport
    }
    '/expensive/': {
      preLoaderRoute: typeof ExpensiveIndexImport
      parentRoute: typeof rootRoute
    }
    '/dashboard/invoices/$invoiceId': {
      preLoaderRoute: typeof DashboardInvoicesInvoiceIdImport
      parentRoute: typeof DashboardInvoicesImport
    }
    '/dashboard/users/user': {
      preLoaderRoute: typeof DashboardUsersUserImport
      parentRoute: typeof DashboardUsersImport
    }
    '/dashboard/invoices/': {
      preLoaderRoute: typeof DashboardInvoicesIndexImport
      parentRoute: typeof DashboardInvoicesImport
    }
    '/dashboard/users/': {
      preLoaderRoute: typeof DashboardUsersIndexImport
      parentRoute: typeof DashboardUsersImport
    }
  }
}
export const routeTree = rootRoute.addChildren([
  IndexRoute,
  AuthRoute.addChildren([AuthProfileRoute]),
  LayoutRoute.addChildren([LayoutLayoutARoute, LayoutLayoutBRoute]),
  DashboardRoute.addChildren([
    DashboardInvoicesRoute.addChildren([
      DashboardInvoicesInvoiceIdRoute,
      DashboardInvoicesIndexRoute,
    ]),
    DashboardUsersRoute.addChildren([
      DashboardUsersUserRoute,
      DashboardUsersIndexRoute,
    ]),
    DashboardIndexRoute,
  ]),
  LoginRoute,
  ExpensiveIndexRoute,
])
