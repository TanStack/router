const $$splitComponentImporter = () => import('arrow-function.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule && newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}