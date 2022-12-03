import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "../posts";
const routeConfig = parentRouteConfig.createRoute({
  path: "/",
  component: lazy(() => import('./index-component').then(d => ({
    default: d.component
  })))
});
export { routeConfig };