console.warn("[tanstack-router] These exports from \"shared-call-expression.tsx\" will not be code-split and will increase your bundle size:\n- collection\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-call-expression.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Call expression initializers - should still work
export const collection = {
  create: (name: string) => ({
    name,
    items: []
  })
}.create('todos');
export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection.items;
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});