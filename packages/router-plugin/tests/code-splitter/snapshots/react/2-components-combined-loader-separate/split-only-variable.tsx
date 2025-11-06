const $$splitComponentImporter = () => import('./split-only-variable.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('./split-only-variable.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Variable used ONLY in component (split part), NOT in loader
// Should NOT be exported from reference file or imported in split file
const onlySplit = new Map();
onlySplit.set('key', 'value');
export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});