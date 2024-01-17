import { FileRoute, lazyFn, lazyRouteComponent } from '@tanstack/react-router'

import { Route as rootRoute } from './routes/__root'
import { Route as IndexImport } from './routes/index'

const HelloComponentImport = new FileRoute('/hello').createRoute()

const HelloComponentRoute = HelloComponentImport.update({
  path: '/hello',
  getParentRoute: () => rootRoute,
} as any)
  .updateLoader({
    loader: lazyFn(() => import('./routes/hello.loader'), 'loader'),
  })
  .update({
    component: lazyRouteComponent(
      () => import('./routes/hello.component'),
      'component',
    ),
  })

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
      preLoaderRoute: typeof HelloComponentImport
      parentRoute: typeof rootRoute
    }
  }
}
export const routeTree = rootRoute.addChildren([
  IndexRoute,
  HelloComponentRoute,
])
