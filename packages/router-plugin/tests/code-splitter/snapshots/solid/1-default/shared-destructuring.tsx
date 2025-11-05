console.warn("[tanstack-router] These exports from \"shared-destructuring.tsx\" will not be code-split and will increase your bundle size:\n- apiUrl\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
const $$splitComponentImporter = () => import('./shared-destructuring.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Destructuring - ensure we promote the right binding
const cfg = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
export const {
  apiUrl
} = cfg;
export const Route = createFileRoute('/test')({
  loader: async () => {
    // Uses the destructured binding
    return fetch(apiUrl).then(r => r.json());
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});