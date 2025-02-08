const $$splitLoaderImporter = () => import('react-memo-component.tsx?tsr-split=component---loader');
import { lazyFn } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('react-memo-component.tsx?tsr-split=component---loader');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});