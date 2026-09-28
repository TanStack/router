import { format } from "shared-function-overloads.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-function-overloads.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-function-overloads.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export { format as formatValue };
export const Route = createFileRoute('/overloads')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
export { format } from "shared-function-overloads.tsx?tsr-shared=1";