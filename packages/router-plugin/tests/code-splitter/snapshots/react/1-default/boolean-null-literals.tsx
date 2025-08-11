const $$splitErrorComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('boolean-null-literals.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/router';

// Test errorComponent with false literal
export const Route = createFileRoute('/test')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  pendingComponent: null,
  loader: async () => ({
    data: 'test'
  })
});