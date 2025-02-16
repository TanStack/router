const $$splitLoaderImporter = () => import('imported.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('imported.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});
export function TSRDummyComponent() {
  return null;
}