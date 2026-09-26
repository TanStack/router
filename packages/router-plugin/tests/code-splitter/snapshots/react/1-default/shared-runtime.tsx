import { state, increment } from "shared-runtime.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import("shared-runtime.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
console.log('shared-runtime:reference');
export const Route = createFileRoute('/shared-runtime')({ beforeLoad: () => state, loader: () => {
  increment();
  return state;
}, component: lazyRouteComponent($$splitComponentImporter, "component") });
export { createSeed as default, state as firstState, state as secondState, state as "odd-name" } from "shared-runtime.tsx?tsr-shared=1";