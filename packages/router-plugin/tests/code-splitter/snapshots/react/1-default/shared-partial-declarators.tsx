console.warn("[tanstack-router] These exports from \"shared-partial-declarators.tsx\" will not be code-split and will increase your bundle size:\n- shared\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-partial-declarators.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Multiple declarators in same statement
// Only 'shared' is used by both loader and component
// 'a' is only used in component, should NOT be exported
export const shared = new Map();
export const Route = createFileRoute('/test')({
  loader: async () => {
    // Only uses shared, not a
    shared.set('loaded', true);
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});