console.warn("[tanstack-router] These exports from \"shared-multiple-variables.tsx\" will not be code-split and will increase your bundle size:\n- collection1\n- collection2\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-multiple-variables.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Multiple shared variables used by both loader and component
export const collection1 = {
  name: 'todos',
  preload: async () => {}
};
export const collection2 = {
  name: 'users',
  preload: async () => {}
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    await collection1.preload();
    await collection2.preload();
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});