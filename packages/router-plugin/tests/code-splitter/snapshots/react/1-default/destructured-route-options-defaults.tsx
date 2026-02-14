const $$splitComponentImporter = () => import('destructured-route-options-defaults.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
function defaultLoader() {
  return {
    message: 'default'
  };
}
const createBits = () => ({
  component: ActualComponent,
  loader: () => ({
    message: 'hello'
  })
});
const {
  loader = defaultLoader
} = createBits();
function ActualComponent() {
  return <div>About</div>;
}
export const Route = createFileRoute('/about')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader
});