console.warn("[tanstack-router] These exports from \"shared-multiple-declarations.tsx\" will not be code-split and will increase your bundle size:\n- collection1\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('shared-multiple-declarations.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Multiple declarations in same const statement
// Only collection1 is shared, but both are in same declaration
export const collection1 = {
  name: 'todos'
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection1.name;
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});