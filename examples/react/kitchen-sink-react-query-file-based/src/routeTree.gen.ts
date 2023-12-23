import { Route as rootRoute } from "./routes/__root"
import { Route as LoginRoute } from "./routes/login"
import { Route as DashboardRoute } from "./routes/dashboard"
import { Route as LayoutRoute } from "./routes/_layout"
import { Route as AuthRoute } from "./routes/_auth"
import { Route as IndexRoute } from "./routes/index"
import { Route as DashboardUsersRoute } from "./routes/dashboard.users"
import { Route as DashboardInvoicesRoute } from "./routes/dashboard.invoices"
import { Route as LayoutLayoutBRoute } from "./routes/_layout.layout-b"
import { Route as LayoutLayoutARoute } from "./routes/_layout.layout-a"
import { Route as AuthProfileRoute } from "./routes/_auth.profile"
import { Route as ExpensiveIndexRoute } from "./routes/expensive/index"
import { Route as DashboardIndexRoute } from "./routes/dashboard.index"
import { Route as DashboardUsersUserRoute } from "./routes/dashboard.users.user"
import { Route as DashboardInvoicesInvoiceIdRoute } from "./routes/dashboard.invoices.$invoiceId"
import { Route as DashboardUsersIndexRoute } from "./routes/dashboard.users.index"
import { Route as DashboardInvoicesIndexRoute } from "./routes/dashboard.invoices.index"

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      parentRoute: typeof rootRoute
    }
    "/_auth": {
      parentRoute: typeof rootRoute
    }
    "/_layout": {
      parentRoute: typeof rootRoute
    }
    "/dashboard": {
      parentRoute: typeof rootRoute
    }
    "/login": {
      parentRoute: typeof rootRoute
    }
    "/dashboard/": {
      parentRoute: typeof DashboardRoute
    }
    "/expensive/": {
      parentRoute: typeof rootRoute
    }
    "/_auth/profile": {
      parentRoute: typeof AuthRoute
    }
    "/_layout/layout-a": {
      parentRoute: typeof LayoutRoute
    }
    "/_layout/layout-b": {
      parentRoute: typeof LayoutRoute
    }
    "/dashboard/invoices": {
      parentRoute: typeof DashboardRoute
    }
    "/dashboard/users": {
      parentRoute: typeof DashboardRoute
    }
    "/dashboard/invoices/": {
      parentRoute: typeof DashboardInvoicesRoute
    }
    "/dashboard/users/": {
      parentRoute: typeof DashboardUsersRoute
    }
    "/dashboard/invoices/$invoiceId": {
      parentRoute: typeof DashboardInvoicesRoute
    }
    "/dashboard/users/user": {
      parentRoute: typeof DashboardUsersRoute
    }
  }
}

Object.assign(IndexRoute.options, {
  path: "/",
  getParentRoute: () => rootRoute,
})

Object.assign(AuthRoute.options, {
  id: "/auth",
  getParentRoute: () => rootRoute,
})

Object.assign(LayoutRoute.options, {
  id: "/layout",
  getParentRoute: () => rootRoute,
})

Object.assign(DashboardRoute.options, {
  path: "/dashboard",
  getParentRoute: () => rootRoute,
})

Object.assign(LoginRoute.options, {
  path: "/login",
  getParentRoute: () => rootRoute,
})

Object.assign(DashboardIndexRoute.options, {
  path: "/",
  getParentRoute: () => DashboardRoute,
})

Object.assign(ExpensiveIndexRoute.options, {
  path: "/expensive/",
  getParentRoute: () => rootRoute,
})

Object.assign(AuthProfileRoute.options, {
  path: "/profile",
  getParentRoute: () => AuthRoute,
})

Object.assign(LayoutLayoutARoute.options, {
  path: "/layout-a",
  getParentRoute: () => LayoutRoute,
})

Object.assign(LayoutLayoutBRoute.options, {
  path: "/layout-b",
  getParentRoute: () => LayoutRoute,
})

Object.assign(DashboardInvoicesRoute.options, {
  path: "/invoices",
  getParentRoute: () => DashboardRoute,
})

Object.assign(DashboardUsersRoute.options, {
  path: "/users",
  getParentRoute: () => DashboardRoute,
})

Object.assign(DashboardInvoicesIndexRoute.options, {
  path: "/",
  getParentRoute: () => DashboardInvoicesRoute,
})

Object.assign(DashboardUsersIndexRoute.options, {
  path: "/",
  getParentRoute: () => DashboardUsersRoute,
})

Object.assign(DashboardInvoicesInvoiceIdRoute.options, {
  path: "/$invoiceId",
  getParentRoute: () => DashboardInvoicesRoute,
})

Object.assign(DashboardUsersUserRoute.options, {
  path: "/user",
  getParentRoute: () => DashboardUsersRoute,
})

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  AuthRoute.addChildren([AuthProfileRoute]),
  LayoutRoute.addChildren([LayoutLayoutARoute, LayoutLayoutBRoute]),
  DashboardRoute.addChildren([
    DashboardIndexRoute,
    DashboardInvoicesRoute.addChildren([
      DashboardInvoicesIndexRoute,
      DashboardInvoicesInvoiceIdRoute,
    ]),
    DashboardUsersRoute.addChildren([
      DashboardUsersIndexRoute,
      DashboardUsersUserRoute,
    ]),
  ]),
  LoginRoute,
  ExpensiveIndexRoute,
])
