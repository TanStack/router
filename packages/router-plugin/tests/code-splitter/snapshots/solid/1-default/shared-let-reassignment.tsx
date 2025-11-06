console.warn("[tanstack-router] These exports from \"shared-let-reassignment.tsx\" will not be code-split and will increase your bundle size:\n- store\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-let-reassignment.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// let with reassignment - tests live binding behavior
export let store = {
  count: 0
};
store = {
  count: 1,
  updated: true
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    store.count++;
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});