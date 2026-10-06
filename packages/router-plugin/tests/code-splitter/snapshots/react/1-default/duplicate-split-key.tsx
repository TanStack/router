const $$splitComponentImporter2 = () => import("duplicate-split-key.tsx?tsr-split=component");
const $$splitComponentImporter = () => import("duplicate-split-key.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component"), component: lazyRouteComponent($$splitComponentImporter2, "component") });