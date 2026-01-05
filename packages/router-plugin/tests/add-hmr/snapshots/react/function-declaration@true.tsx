const $$splitComponentImporter = () => import('function-declaration.tsx?tsr-split=component');
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
        router.processedTree.matchCache.clear();
        router.processedTree.flatCache?.clear();
        router.processedTree.singleCache.clear();
        router.resolvePathCache.clear();
        walkReplaceSegmentTree(newRoute, router.processedTree.segmentTree);
        const filter = m => m.routeId === oldRoute.id;
        if (router.state.matches.find(filter) || router.state.pendingMatches?.find(filter)) {
          router.invalidate({
            filter
          });
        }
        ;
        function walkReplaceSegmentTree(route, node) {
          if (node.route?.id === route.id) node.route = route;
          if (node.index) walkReplaceSegmentTree(route, node.index);
          node.static?.forEach(child => walkReplaceSegmentTree(route, child));
          node.staticInsensitive?.forEach(child => walkReplaceSegmentTree(route, child));
          node.dynamic?.forEach(child => walkReplaceSegmentTree(route, child));
          node.optional?.forEach(child => walkReplaceSegmentTree(route, child));
          node.wildcard?.forEach(child => walkReplaceSegmentTree(route, child));
        }
      })(Route, newModule.Route);
    }
  });
}