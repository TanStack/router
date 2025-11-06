const $$splitComponentImporter = () => import('split-only-variable.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Variable used ONLY in component (split part), NOT in loader
// Should NOT be exported from reference file or imported in split file
const onlySplit = new Map();
onlySplit.set('key', 'value');
export const Route = createFileRoute('/test')({
  loader: async () => {
    // Loader doesn't use onlySplit at all
    return {
      data: 'loaded'
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});