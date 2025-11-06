console.warn("[tanstack-router] These exports from \"shared-nested-function-usage.tsx\" will not be code-split and will increase your bundle size:\n- collection\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-nested-function-usage.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Variable used inside nested function
export const collection = {
  name: 'todos',
  items: []
};
function loadData() {
  return collection.items;
}
export const Route = createFileRoute('/test')({
  loader: loadData,
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});