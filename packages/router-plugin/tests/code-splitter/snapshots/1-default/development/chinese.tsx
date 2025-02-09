const $$splitComponentImporter = () => import('chinese.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
interface DemoProps {
  title: string;
}
export function TSRDummyComponent() {
  return null;
}