import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "./__root.client";
import { useMatch } from '@tanstack/react-router';
const routeConfig = parentRouteConfig.createRoute({
  path: "posts",
  component: lazy(() => import('./posts-component').then(d => ({
    default: d.component
  }))),
  loader: (true as any),
  errorComponent: lazy(() => import('./posts-errorComponent').then(d => ({
    default: d.errorComponent
  }))),
  meta: {
    title: 'Posts'
  }
});
export { routeConfig, routeConfig as postsRoute };