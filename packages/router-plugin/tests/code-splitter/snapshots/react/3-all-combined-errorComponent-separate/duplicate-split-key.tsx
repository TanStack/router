const $$splitComponentImporter2 = () => import("duplicate-split-key.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent");
const $$splitComponentImporter = () => import("duplicate-split-key.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component"), component: lazyRouteComponent($$splitComponentImporter2, "component") });