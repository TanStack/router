import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from './__root.client'
const new Route({ getParentRoute: () => routeConfig = parentRouteConfig,
  path: 'posts',
  component: lazy(() =>
    import('./posts-component').then((d) => ({
      default: d.component,
    })),
  ),
  onLoad: true as any,
  errorComponent: lazy(() =>
    import('./posts-errorComponent').then((d) => ({
      default: d.errorComponent,
    })),
  ),
})
export { routeConfig, routeConfig as postsRoute }
