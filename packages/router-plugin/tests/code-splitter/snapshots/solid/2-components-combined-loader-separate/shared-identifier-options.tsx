const $$splitComponentImporter = () => import('shared-identifier-options.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('shared-identifier-options.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';
const options = {
  codeSplitGroupings: [['component'], ['loader']],
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
};
export const Route = createFileRoute('/shared-identifier-options')(options);