const $$splitComponentImporter = () => import("self-referencing-side-effect.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
import { store } from './store';
const unsubscribe = store.subscribe(() => {
  if (store.state.done) {
    unsubscribe();
  }
});
export const Route = createFileRoute('/')({ component: lazyRouteComponent($$splitComponentImporter, "component") });