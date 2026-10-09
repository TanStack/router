const $$splitComponentImporter = () => import('shared-function-overloads.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-function-overloads.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number) {
  return String(value);
}
export { format as formatValue };
export const Route = createFileRoute('/overloads')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});