const $$splitComponentImporter = () => import('inline.tsx?tsr-split=component---loader');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
Route.addChildren([]);
export const test = 'test';