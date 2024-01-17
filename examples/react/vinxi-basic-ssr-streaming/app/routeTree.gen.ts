import { Route as rootRoute } from './routes/__root'
import { Route as HelloImport } from './routes/hello'
import { Route as IndexImport } from './routes/index'

const HelloRoute = HelloImport.update({
  path: '/hello',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any)
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/hello': {
      preLoaderRoute: typeof HelloImport
      parentRoute: typeof rootRoute
    }
  }
}
export const routeTree = rootRoute.addChildren([IndexRoute, HelloRoute])
