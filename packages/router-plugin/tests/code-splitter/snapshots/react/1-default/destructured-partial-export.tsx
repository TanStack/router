const $$splitComponentImporter = () => import("destructured-partial-export.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
const { title, subtitle } = getCopy();
export { title };
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component") });
function getCopy() {
  return { title: 'Title', subtitle: 'Subtitle' };
}