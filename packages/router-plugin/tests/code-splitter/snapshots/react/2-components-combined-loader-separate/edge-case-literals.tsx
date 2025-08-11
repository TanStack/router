const $$splitLoaderImporter = () => import('edge-case-literals.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
const $$splitErrorComponentImporter = () => import('edge-case-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('edge-case-literals.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/router';

// Test edge cases with true, undefined, and mixed scenarios
export const Route = createFileRoute('/edge-test')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  // BooleanLiteral with true value
  pendingComponent: undefined,
  // Should be handled by existing logic
  loader: lazyFn($$splitLoaderImporter, 'loader')
});