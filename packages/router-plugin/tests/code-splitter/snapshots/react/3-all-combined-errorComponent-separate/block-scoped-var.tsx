const $$splitComponentImporter = () => import("block-scoped-var.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
const $$splitLoaderImporter = () => import("block-scoped-var.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent");
import { lazyFn } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
if (typeof window === 'undefined') {
  var environment = 'server';
}
for (var index = 0; index < 3; index++) {}
export { environment };
export const Route = createFileRoute('/')({ loader: lazyFn($$splitLoaderImporter, "loader"), component: lazyRouteComponent($$splitComponentImporter, "component") });