const $$splitComponentImporter = () => import("shared-native-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
const $$splitLoaderImporter = () => import("shared-native-literals.tsx?tsr-split=loader");
import { lazyFn } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/native-literals')({ loader: lazyFn($$splitLoaderImporter, "loader"), component: lazyRouteComponent($$splitComponentImporter, "component") });