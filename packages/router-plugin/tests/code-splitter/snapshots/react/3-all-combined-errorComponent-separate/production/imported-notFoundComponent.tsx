const $$splitNotFoundComponentImporter = () => import('imported-notFoundComponent.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('imported-notFoundComponent.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent', undefined, import.meta.url)
});