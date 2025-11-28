const $$splitComponentImporter = () => import('destructured-export.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';
const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
const fallbackLoader = () => ({
  message: 'fallback'
});
const {
  loader = fallbackLoader
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
export const Route = createFileRoute('/about')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader
});