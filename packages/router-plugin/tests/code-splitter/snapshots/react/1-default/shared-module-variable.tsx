console.warn("[tanstack-router] These exports from \"shared-module-variable.tsx\" will not be code-split and will increase your bundle size:\n- collection\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-module-variable.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Module-level variable used in both loader and component
// This simulates a collection/query that should only be initialized once
export const collection = {
  name: 'todos',
  preload: async () => {}
}; // Side effect at module level - should only run once
console.log('Module initialized:', collection.name);
export const Route = createFileRoute('/todos')({
  loader: async () => {
    // Use collection in loader
    await collection.preload();
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});