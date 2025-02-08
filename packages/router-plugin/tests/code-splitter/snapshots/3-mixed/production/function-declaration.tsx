const $$splitComponentImporter = () => import('function-declaration.tsx?tsr-split=component---loader');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('function-declaration.tsx?tsr-split=component---loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});