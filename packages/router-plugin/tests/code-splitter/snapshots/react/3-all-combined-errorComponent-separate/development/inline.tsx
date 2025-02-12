const $$splitComponentImporter = () => import('inline.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
Route.addChildren([]);
export const test = 'test';
export function TSRDummyComponent() {
  return null;
}