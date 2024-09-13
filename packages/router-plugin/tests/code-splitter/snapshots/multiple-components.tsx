const $$splitLoaderImporter = () => import('tsr-split:multiple-components.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
const $$splitPendingComponentImporter = () => import('tsr-split:multiple-components.tsx?tsr-split');
const $$splitComponentImporter = () => import('tsr-split:multiple-components.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});