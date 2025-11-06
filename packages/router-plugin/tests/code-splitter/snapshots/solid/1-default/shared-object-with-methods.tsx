console.warn("[tanstack-router] These exports from \"shared-object-with-methods.tsx\" will not be code-split and will increase your bundle size:\n- api\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-object-with-methods.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Object contains methods (functions) - should still be shared as whole object
export const api = {
  endpoint: 'http://api.com',
  fetch: async () => ({
    data: 'loaded'
  }),
  cache: new Map()
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    return api.fetch();
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});