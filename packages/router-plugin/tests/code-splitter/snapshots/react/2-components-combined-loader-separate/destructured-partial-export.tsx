const $$splitComponentImporter = () => import("destructured-partial-export.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
const { title } = getCopy();
export { title };
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component") });
function getCopy() {
  return { title: 'Title', subtitle: 'Subtitle' };
}