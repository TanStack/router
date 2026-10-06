const $$splitComponentImporter = () => import("exported-function-private-state.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
const state = { count: 0 };
export function increment() {
  return ++state.count;
}
let renders = 0;
export function getRenders() {
  return renders;
}
export function format(value: number) {
  return `#${value}`;
}
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component") });