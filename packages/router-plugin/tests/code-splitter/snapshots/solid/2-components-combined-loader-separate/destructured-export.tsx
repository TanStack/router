const $$splitLoaderImporter = () => import('destructured-export.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
const $$splitComponentImporter = () => import('destructured-export.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';
export const Route = createFileRoute('/about')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});