import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({ component: undefined });
const hot = import.meta.hot;
if (hot && typeof window !== 'undefined') {
  hot.data ??= {};
  const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map();
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports;
    window.__getReactRefreshIgnoredExports = (ctx) => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? [];
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? [];
      return [...ignoredExports, ...moduleIgnored];
    };
    return { ignoredExportsById };
  })();
  tsrReactRefresh.ignoredExportsById.set("explicit-undefined-component.tsx", ['Route']);
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
    // Generated route-tree options are not present on the freshly imported route
    // module, but they must stay on the live route before rebuilding indexes.
    const generatedRouteOptionKeys = new Set(["id", "path", "getParentRoute"]);
    const generatedRouteOptions = {};
    generatedRouteOptionKeys.forEach((key) => {
      if (key in oldRoute.options) {
        generatedRouteOptions[key] = oldRoute.options[key];
      }
    });
    const oldHasShellComponent = "shellComponent" in oldRoute.options;
    const newHasShellComponent = "shellComponent" in newRoute.options;
    const preserveComponentIdentity = oldHasShellComponent === newHasShellComponent;
    // Keys whose identity must remain stable to prevent React from
    // unmounting/remounting the component tree.  React Fast Refresh already
    // handles hot-updating the function bodies of these components — our job
    // is only to update non-component route options (loader, head, etc.).
    // For code-split (splittable) routes, the lazyRouteComponent wrapper is
    // already cached in the bundler hot data so its identity is stable.
    // For unsplittable routes (e.g. root routes), the component is a plain
    // function reference that gets recreated on every module re-execution,
    // so we must explicitly preserve the old reference.
    // Preserve component identity so React doesn't remount.
    // React Fast Refresh patches the function bodies in-place.
    const componentKeys = ["component", "shellComponent", "pendingComponent", "errorComponent", "notFoundComponent"];
    if (preserveComponentIdentity) {
      componentKeys.forEach((key) => {
        if (key in oldRoute.options && key in newRoute.options) {
          newRoute.options[key] = oldRoute.options[key];
        }
      });
    }
    ;
    const nextOptions = { ...newRoute.options, ...generatedRouteOptions };
    oldRoute.options = nextOptions;
    oldRoute.update(nextOptions);
    router._replaceRouteChunk(oldRoute, newRoute.lazyFn);
    router.setRoutes(router.buildRouteTree());
    syncHotRouteExport(oldRoute);
    router.resolvePathCache.clear();
    void router._refreshRoute?.();
    function syncHotRouteExport(liveRoute) {
      // routeTree.gen.ts mutates the original module export with generated
      // routing state. Mirror that state onto the fresh HMR export too, so
      // aliased route imports keep working after the module is hot-reloaded.
      newRoute.options = liveRoute.options;
      newRoute.parentRoute = liveRoute.parentRoute;
      newRoute._path = liveRoute._path;
      newRoute._id = liveRoute._id;
      newRoute._fullPath = liveRoute._fullPath;
      newRoute._to = liveRoute._to;
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
  hot.accept((newModule) => {
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