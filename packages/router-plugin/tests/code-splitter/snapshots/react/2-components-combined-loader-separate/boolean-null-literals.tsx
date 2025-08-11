const $$splitLoaderImporter = () => import('boolean-null-literals.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
const $$splitPendingComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitErrorComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/router';

// Test errorComponent with false literal
export const Route = createFileRoute('/test')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});