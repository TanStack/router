import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('tsr-split:/Users/tannerlinsley/GitHub/router/packages/router-vite-plugin/inline.tsx?tsr-split');
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
Route.addChildren([]);
export const test = 'test';