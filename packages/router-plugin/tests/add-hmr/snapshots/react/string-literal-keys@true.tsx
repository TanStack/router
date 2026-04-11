const $$splitErrorComponentImporter = () => import('string-literal-keys.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('string-literal-keys.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
const TSRSplitComponent = (() => {
  const hot = import.meta.hot;
  const hotData = hot ? hot.data ??= {} : undefined;
  return hotData?.["tsr-split-component:component"] ?? lazyRouteComponent($$splitComponentImporter, "component");
})();
if (import.meta.hot) {
  (import.meta.hot.data ??= {})["tsr-split-component:component"] = TSRSplitComponent;
}
const TSRSplitErrorComponent = (() => {
  const hot = import.meta.hot;
  const hotData = hot ? hot.data ??= {} : undefined;
  return hotData?.["tsr-split-component:errorComponent"] ?? lazyRouteComponent($$splitErrorComponentImporter, "errorComponent");
})();
if (import.meta.hot) {
  (import.meta.hot.data ??= {})["tsr-split-component:errorComponent"] = TSRSplitErrorComponent;
}
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  'component': TSRSplitComponent,
  'errorComponent': TSRSplitErrorComponent
});
const hot = import.meta.hot;
if (hot && typeof window !== 'undefined') {
  ;
  hot.data ??= {};
  const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map();
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports;
    window.__getReactRefreshIgnoredExports = ctx => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? [];
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? [];
      return [...ignoredExports, ...moduleIgnored];
    };
    return {
      ignoredExportsById
    };
  })();
  tsrReactRefresh.ignoredExportsById.set("string-literal-keys.tsx", ['Route']);
}
export function TSRFastRefreshAnchor() {
  return null;
}
if (import.meta.hot) {
  const hot = import.meta.hot;
  const hotData = hot.data ??= {};
  hot.accept(newModule => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id;
      if (routeId) {
        hotData['tsr-route-id'] = routeId;
      }
      (function handleRouteUpdate(routeId, newRoute) {
        const router = window.__TSR_ROUTER__;
        const oldRoute = router.routesById[routeId];
        if (!oldRoute) {
          return;
        }
        ;
        const removedKeys = new Set();
        Object.keys(oldRoute.options).forEach(key => {
          if (!(key in newRoute.options)) {
            removedKeys.add(key);
            delete oldRoute.options[key];
          }
        });
        const componentKeys = ["component", "shellComponent", "pendingComponent", "errorComponent", "notFoundComponent"];
        componentKeys.forEach(key => {
          if (key in oldRoute.options && key in newRoute.options) {
            newRoute.options[key] = oldRoute.options[key];
          }
        });
        oldRoute.options = newRoute.options;
        oldRoute.update(newRoute.options);
        oldRoute._componentsPromise = undefined;
        oldRoute._lazyPromise = undefined;
        router.routesById[oldRoute.id] = oldRoute;
        router.routesByPath[oldRoute.fullPath] = oldRoute;
        router.processedTree.matchCache.clear();
        router.processedTree.flatCache?.clear();
        router.processedTree.singleCache.clear();
        router.resolvePathCache.clear();
        walkReplaceSegmentTree(oldRoute, router.processedTree.segmentTree);
        const filter = m => m.routeId === oldRoute.id;
        const activeMatch = router.stores.matches.get().find(filter);
        const pendingMatch = router.stores.pendingMatches.get().find(filter);
        const cachedMatches = router.stores.cachedMatches.get().filter(filter);
        if (activeMatch || pendingMatch || cachedMatches.length > 0) {
          if (removedKeys.has("loader") || removedKeys.has("beforeLoad")) {
            const matchIds = [activeMatch?.id, pendingMatch?.id, ...cachedMatches.map(match => match.id)].filter(Boolean);
            router.batch(() => {
              for (const matchId of matchIds) {
                const store = router.stores.pendingMatchStores.get(matchId) || router.stores.matchStores.get(matchId) || router.stores.cachedMatchStores.get(matchId);
                if (store) {
                  store.set(prev => {
                    const next = {
                      ...prev
                    };
                    if (removedKeys.has("loader")) {
                      next.loaderData = undefined;
                    }
                    ;
                    if (removedKeys.has("beforeLoad")) {
                      next.__beforeLoadContext = undefined;
                    }
                    ;
                    return next;
                  });
                }
              }
            });
          }
          ;
          router.invalidate({
            filter,
            sync: true
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
      })(routeId, newModule.Route);
    }
  });
}