const $$splitComponentImporter = () => import('./shared-nested-closure.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('./shared-nested-closure.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Nested closure - ensure we track through closures

export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});