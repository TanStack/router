const $$splitErrorComponentImporter = () => import('edge-case-literals.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('edge-case-literals.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/router';

// Test edge cases with true, undefined, and mixed scenarios
export const Route = createFileRoute('/edge-test')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  // BooleanLiteral with true value
  pendingComponent: undefined,
  // Should be handled by existing logic
  loader: async () => ({
    data: 'edge'
  })
});