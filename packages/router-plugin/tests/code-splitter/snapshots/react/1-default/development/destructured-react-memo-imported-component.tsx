const $$splitComponentImporter = () => import('destructured-react-memo-imported-component.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import { importedLoader } from '../../shared/imported';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  loader: importedLoader
});
export function TSRDummyComponent() {
  return null;
}