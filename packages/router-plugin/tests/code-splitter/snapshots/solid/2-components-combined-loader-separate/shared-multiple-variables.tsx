const $$splitComponentImporter = () => import('shared-multiple-variables.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('shared-multiple-variables.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Multiple shared variables used by both loader and component

export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});