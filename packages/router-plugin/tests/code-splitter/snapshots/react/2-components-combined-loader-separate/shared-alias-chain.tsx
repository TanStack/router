const $$splitComponentImporter = () => import('shared-alias-chain.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-alias-chain.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Alias chain - ensure we track through aliases

export const Route = createFileRoute('/test')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});