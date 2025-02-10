const $$splitComponentImporter = () => import('function-declaration.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
export function TSRDummyComponent() {
  return null;
}