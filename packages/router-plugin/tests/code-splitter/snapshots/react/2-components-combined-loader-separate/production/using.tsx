const $$splitNotFoundComponentImporter = () => import('using.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('using.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitErrorComponentImporter = () => import('using.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('using.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
export const Route = createFileRoute({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent')
});