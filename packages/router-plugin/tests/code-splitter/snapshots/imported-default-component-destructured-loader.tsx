const $$splitLoaderImporter = () => import('tsr-split:imported-default-component-destructured-loader.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('tsr-split:imported-default-component-destructured-loader.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import '../shared/imported';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});