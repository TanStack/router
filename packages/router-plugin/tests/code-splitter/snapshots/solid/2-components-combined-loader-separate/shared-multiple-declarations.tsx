const $$splitComponentImporter = () => import('./shared-multiple-declarations.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('./shared-multiple-declarations.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Multiple declarations in same const statement
// Only collection1 is shared, but both are in same declaration

export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});