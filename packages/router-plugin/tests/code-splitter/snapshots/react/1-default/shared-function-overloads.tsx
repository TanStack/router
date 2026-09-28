import { format } from "shared-function-overloads.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-function-overloads.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export { format as formatValue };
export const Route = createFileRoute('/overloads')({
  loader: () => format(42),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
export { format } from "shared-function-overloads.tsx?tsr-shared=1";