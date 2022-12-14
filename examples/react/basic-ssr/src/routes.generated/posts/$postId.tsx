import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "../posts";
import { useLoaderData } from '@tanstack/react-router';
export type PostType = {
  id: string;
  title: string;
  body: string;
};
const routeConfig = parentRouteConfig.createRoute({
  path: "$postId",
  component: lazy(() => import('./$postId-component').then(d => ({
    default: d.component
  }))),
  loader: (...args) => import('./$postId-loader').then(d => d.loader.apply(d.loader, (args as any)))
});
export { routeConfig };