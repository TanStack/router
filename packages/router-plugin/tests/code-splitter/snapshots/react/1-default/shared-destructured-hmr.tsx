import { render, read } from "shared-destructured-hmr.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-destructured-hmr.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/hmr-probe')({
  loader: () => read(),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent: render
});