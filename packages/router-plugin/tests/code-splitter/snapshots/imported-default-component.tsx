const $$splitComponentImporter = () => import('imported-default-component.tsx?tsr-split');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
export function TSR_Dummy_Component() {
  return null;
}