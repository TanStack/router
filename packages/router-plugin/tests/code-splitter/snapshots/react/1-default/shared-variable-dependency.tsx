console.warn("[tanstack-router] These exports from \"shared-variable-dependency.tsx\" will not be code-split and will increase your bundle size:\n- collection\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('shared-variable-dependency.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

// Variable references another shared variable
const baseConfig = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
export const collection = {
  config: baseConfig,
  name: 'todos'
};
export const Route = createFileRoute('/test')({
  loader: async () => {
    return collection.name;
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});