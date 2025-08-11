const $$splitLoaderImporter = () => import('boolean-null-literals.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/react-router';
const $$splitPendingComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitErrorComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/router';

// Test errorComponent with false literal
export const Route = createFileRoute('/test')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});