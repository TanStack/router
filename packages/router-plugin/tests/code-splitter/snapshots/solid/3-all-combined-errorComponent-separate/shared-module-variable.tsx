const $$splitComponentImporter = () => import('./shared-module-variable.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('./shared-module-variable.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Module-level variable used in both loader and component
// This simulates a collection/query that should only be initialized once
const collection = {
  name: 'todos',
  preload: async () => {}
};

// Side effect at module level - should only run once
console.log('Module initialized:', collection.name);
export const Route = createFileRoute('/todos')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});