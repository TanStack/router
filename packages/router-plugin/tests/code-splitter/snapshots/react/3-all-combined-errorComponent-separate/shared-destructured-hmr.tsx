const $$splitPendingComponentImporter = () => import('shared-destructured-hmr.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('shared-destructured-hmr.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-destructured-hmr.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/hmr-probe')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent')
});