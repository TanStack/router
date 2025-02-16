const $$splitComponentImporter = () => import('retain-exports-loader.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export function loaderFn() {
  return {
    foo: 'bar'
  };
}
export const Route = createFileRoute('/_layout')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  loader: loaderFn
});
export const SIDEBAR_WIDTH = '150px';
export const SIDEBAR_MINI_WIDTH = '80px';