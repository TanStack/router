const $$splitComponentImporter = () => import('tsr-split:inline.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
Route.addChildren([]);
export const test = 'test';