const $$splitNotFoundComponentImporter = () => import('using.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('using.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitErrorComponentImporter = () => import('using.tsx?tsr-split=errorComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('using.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/react-router';
export const Route = createFileRoute({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent')
});