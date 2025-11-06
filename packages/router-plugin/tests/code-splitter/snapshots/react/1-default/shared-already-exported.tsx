const $$splitComponentImporter = () => import('./shared-already-exported.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

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