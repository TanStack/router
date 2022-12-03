import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "./__root";
const routeConfig = parentRouteConfig.createRoute({
  path: "posts",
  component: lazy(() => import('./posts-component').then(d => ({
    default: d.component
  }))),
  loader: (...args) => import('./posts-loader').then(d => d.loader.apply(d.loader, (args as any))),
  errorComponent: lazy(() => import('./posts-errorComponent').then(d => ({
    default: d.errorComponent
  })))
});
export { routeConfig };