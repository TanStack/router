const $$splitComponentImporter = () => import("shared-native-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/solid-router";
const $$splitLoaderImporter = () => import("shared-native-literals.tsx?tsr-split=loader");
import { lazyFn } from "@tanstack/solid-router";
import { createFileRoute } from '@tanstack/solid-router';
export const Route = createFileRoute('/native-literals')({ loader: lazyFn($$splitLoaderImporter, "loader"), component: lazyRouteComponent($$splitComponentImporter, "component") });