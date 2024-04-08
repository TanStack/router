import { lazyFn } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('tsr-split:imported.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('tsr-split:imported.tsx?tsr-split');
import { createFileRoute } from '@tanstack/react-router';
import '../shared/imported';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});