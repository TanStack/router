const $$splitComponentImporter = () => import("route-reference-loader-helpers.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
const formatter = new Intl.NumberFormat('en');
let label = 'initial';
label = 'updated';
async function fetchPosts() {
  return [formatter.format(1), label];
}
export const Route = createFileRoute('/posts')({ loader: () => fetchPosts(), component: lazyRouteComponent($$splitComponentImporter, "component") });