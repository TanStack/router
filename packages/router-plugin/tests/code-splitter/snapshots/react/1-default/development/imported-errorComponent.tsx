const $$splitErrorComponentImporter = () => import('imported-errorComponent.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('imported-errorComponent.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent', undefined, import.meta.url)
});
export function TSRDummyComponent() {
  return null;
}