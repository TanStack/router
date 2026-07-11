const $$splitErrorComponentImporter = () => import('multi-component.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('multi-component.tsx?tsr-split=component');
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
  component: TSRSplitComponent,
  errorComponent: TSRSplitErrorComponent
});
const hot = import.meta.hot;
if (hot && typeof window !== 'undefined') {
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
  tsrReactRefresh.ignoredExportsById.set("multi-component.tsx", ['Route']);
}
export function TSRFastRefreshAnchor() {
  return null;
}
if (import.meta.hot) {
  const hot = import.meta.hot;
  const hotData = hot.data ??= {};
  const handleRouteUpdate = function handleRouteUpdate(routeId, newRoute) {
    const router = window.__TSR_ROUTER__;
    const oldRoute = router.routesById[routeId];
    if (!oldRoute) {
      return;
    }
    ;
    const generatedRouteOptionKeys = new Set(["id", "path", "getParentRoute"]);
    const generatedRouteOptions = {};
    generatedRouteOptionKeys.forEach(key => {
      if (key in oldRoute.options) {
        generatedRouteOptions[key] = oldRoute.options[key];
      }
    });
    const removedKeys = new Set();
    Object.keys(oldRoute.options).forEach(key => {
      if (!generatedRouteOptionKeys.has(key) && !(key in newRoute.options)) {
        removedKeys.add(key);
        delete oldRoute.options[key];
      }
    });
    const oldHasShellComponent = "shellComponent" in oldRoute.options;
    const newHasShellComponent = "shellComponent" in newRoute.options;
    const preserveComponentIdentity = oldHasShellComponent === newHasShellComponent;
    const componentKeys = ["component", "shellComponent", "pendingComponent", "errorComponent", "notFoundComponent"];
    if (preserveComponentIdentity) {
      componentKeys.forEach(key => {
        if (key in oldRoute.options && key in newRoute.options) {
          newRoute.options[key] = oldRoute.options[key];
        }
      });
    }
    ;
    const nextOptions = {
      ...newRoute.options,
      ...generatedRouteOptions
    };
    oldRoute.options = nextOptions;
    oldRoute.update(nextOptions);
    oldRoute._componentsPromise = undefined;
    oldRoute._componentPromises = undefined;
    oldRoute._componentsLoaded = false;
    oldRoute._lazyPromise = undefined;
    oldRoute._lazyGeneration = (oldRoute._lazyGeneration ?? 0) + 1;
    oldRoute._hmrGeneration = (oldRoute._hmrGeneration ?? 0) + 1;
    oldRoute._lazyLoaded = false;
    router.setRoutes(router.buildRouteTree());
    syncHotRouteExport(oldRoute);
    router.resolvePathCache.clear();
    const filter = m => m.routeId === oldRoute.id;
    const activeMatches = router.stores.matches.get();
    const pendingMatches = router.stores.pendingMatches.get();
    const activeMatch = activeMatches.find(filter);
    const pendingMatch = pendingMatches.find(filter);
    const cachedMatches = router.stores.cachedMatches.get().filter(filter);
    if (activeMatch || pendingMatch || cachedMatches.length > 0) {
      const projectedAssetsRemoved = removedKeys.has("head") || removedKeys.has("scripts");
      if (removedKeys.has("loader") || removedKeys.has("beforeLoad") || projectedAssetsRemoved) {
        const liveStores = [activeMatch && [router.stores.matchStores.get(activeMatch.id), activeMatches], pendingMatch && [router.stores.pendingMatchStores.get(pendingMatch.id), pendingMatches]];
        router.batch(() => {
          for (const live of liveStores) {
            const store = live?.[0];
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
                  next.context = rebuildMatchContextWithoutBeforeLoad(next, live[1]);
                }
                ;
                if (projectedAssetsRemoved) {
                  next.meta = undefined;
                  next.links = undefined;
                  next.headScripts = undefined;
                  next.scripts = undefined;
                  next.styles = undefined;
                }
                ;
                return next;
              });
            }
          }
        });
        if (cachedMatches.length > 0) {
          router.clearCache({
            filter
          });
        }
      }
      ;
      router.invalidate({
        filter,
        sync: true
      });
    }
    ;
    function syncHotRouteExport(liveRoute) {
      newRoute.options = liveRoute.options;
      newRoute.parentRoute = liveRoute.parentRoute;
      newRoute._path = liveRoute._path;
      newRoute._id = liveRoute._id;
      newRoute._fullPath = liveRoute._fullPath;
      newRoute._to = liveRoute._to;
    }
    function rebuildMatchContextWithoutBeforeLoad(match, lane) {
      const parentContext = lane[match.index - 1]?.context ?? router.options.context;
      return {
        ...(parentContext ?? {}),
        ...(match.__routeContext ?? {})
      };
    }
  };
  const initialRouteId = Route.id ?? hotData['tsr-route-id'];
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId;
  }
  const existingRoute = typeof window !== 'undefined' && initialRouteId ? window.__TSR_ROUTER__?.routesById?.[initialRouteId] : undefined;
  if (initialRouteId && existingRoute && existingRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route);
    hotData['tsr-route-update-handled'] = Route;
  }
  hot.accept(newModule => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id;
      if (routeId) {
        hotData['tsr-route-id'] = routeId;
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled'];
        return;
      }
      handleRouteUpdate(routeId, newModule.Route);
    }
  });
}