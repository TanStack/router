const $$splitPendingComponentImporter = () => import('imported-pendingComponent.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('imported-pendingComponent.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent', undefined, import.meta.url)
});
export function TSRDummyComponent() {
  return null;
}