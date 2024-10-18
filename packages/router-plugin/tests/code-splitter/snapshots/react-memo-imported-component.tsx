const $$splitLoaderImporter = () => import('tsr-split:react-memo-imported-component.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('tsr-split:react-memo-imported-component.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});