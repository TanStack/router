const $$splitComponentImporter = () => import('shared-identifier-options.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-identifier-options.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
const options = {
  codeSplitGroupings: [['component'], ['loader']],
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
};
export const Route = createFileRoute('/shared-identifier-options')(options);