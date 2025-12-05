console.warn("[tanstack-router] These exports from \"shared-already-exported.tsx\" will not be code-split and will increase your bundle size:\n- collection\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('shared-already-exported.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Already exported variable - should not be double-exported
export const collection = {
  name: 'todos',
  preload: async () => {}
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    await collection.preload();
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});