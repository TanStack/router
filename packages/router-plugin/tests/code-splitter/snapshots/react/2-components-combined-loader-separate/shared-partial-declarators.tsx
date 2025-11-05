const $$splitComponentImporter = () => import('./shared-partial-declarators.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('./shared-partial-declarators.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported

export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});