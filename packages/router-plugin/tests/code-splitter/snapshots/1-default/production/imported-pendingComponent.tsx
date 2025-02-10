const $$splitPendingComponentImporter = () => import('imported-pendingComponent.tsx?tsr-split=pendingComponent');
const $$splitComponentImporter = () => import('imported-pendingComponent.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent')
});