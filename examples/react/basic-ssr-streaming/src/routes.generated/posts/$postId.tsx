import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "../posts";
export type PostType = {
  id: string;
  title: string;
  body: string;
};
export const tanner = 'foo';
const routeConfig = parentRouteConfig.createRoute({
  path: "$postId",
  component: lazy(() => import('./$postId-component').then(d => ({
    default: d.component
  }))),
  loader: (...args) => import('./$postId-loader').then(d => d.loader.apply(d.loader, (args as any)))
});
export { routeConfig, routeConfig as postspostIdRoute };