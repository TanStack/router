const $$splitComponentImporter = () => import("route-reference-loader-helpers.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
const $$splitLoaderImporter = () => import("route-reference-loader-helpers.tsx?tsr-split=loader");
import { lazyFn } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
let label = 'initial';
label = 'updated';
export const Route = createFileRoute('/posts')({ loader: lazyFn($$splitLoaderImporter, "loader"), component: lazyRouteComponent($$splitComponentImporter, "component") });