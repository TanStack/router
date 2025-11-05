const $$splitComponentImporter = () => import('arrow-function.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (Route && newModule && newModule.Route) {
      (function handleRouteUpdate(oldRoute, newRoute) {
        newRoute._path = oldRoute._path;
        newRoute._id = oldRoute._id;
        newRoute._fullPath = oldRoute._fullPath;
        newRoute._to = oldRoute._to;
        newRoute.children = oldRoute.children;
        newRoute.parentRoute = oldRoute.parentRoute;
        const router = window.__TSR_ROUTER__;
        router.routesById[newRoute.id] = newRoute;
        router.routesByPath[newRoute.fullPath] = newRoute;
        const oldRouteIndex = router.flatRoutes.indexOf(oldRoute);
        if (oldRouteIndex > -1) {
          router.flatRoutes[oldRouteIndex] = newRoute;
        }
        ;
        const filter = m => m.routeId === oldRoute.id;
        if (router.state.matches.find(filter) || router.state.pendingMatches?.find(filter)) {
          router.invalidate({
            filter
          });
        }
      })(Route, newModule.Route);
    }
  });
}