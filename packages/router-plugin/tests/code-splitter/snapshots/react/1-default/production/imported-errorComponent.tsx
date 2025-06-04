const $$splitErrorComponentImporter = () => import('imported-errorComponent.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('imported-errorComponent.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});