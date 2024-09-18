const $$splitComponentImporter = () => import('tsr-split:special-characters.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('tsr-split:special-characters.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});