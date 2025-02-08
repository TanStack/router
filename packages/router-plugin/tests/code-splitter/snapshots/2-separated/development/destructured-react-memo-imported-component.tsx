const $$splitLoaderImporter = () => import('destructured-react-memo-imported-component.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('destructured-react-memo-imported-component.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  loader: lazyFn($$splitLoaderImporter, 'loader')
});
export function TSRDummyComponent() {
  return null;
}