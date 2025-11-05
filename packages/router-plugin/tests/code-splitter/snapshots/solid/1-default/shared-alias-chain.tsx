console.warn("[tanstack-router] These exports from \"shared-alias-chain.tsx\" will not be code-split and will increase your bundle size:\n- alias\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-alias-chain.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Alias chain - ensure we track through aliases
const base = {
  name: 'collection',
  items: []
};
export const alias = base;
export const Route = createFileRoute('/test')({
  loader: async () => {
    return alias.items;
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});