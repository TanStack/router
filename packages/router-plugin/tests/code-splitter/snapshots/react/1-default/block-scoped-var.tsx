const $$splitComponentImporter = () => import("block-scoped-var.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
if (typeof window === 'undefined') {
  var environment = 'server';
}
for (var index = 0; index < 3; index++) {}
export { environment };
export const Route = createFileRoute('/')({ loader: () => index, component: lazyRouteComponent($$splitComponentImporter, "component") });