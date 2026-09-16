const $$splitErrorComponentImporter = () => import('method-shorthand.tsx?tsr-split=errorComponent');
const $$splitNotFoundComponentImporter = () => import('method-shorthand.tsx?tsr-split=notFoundComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/')({
  async loader({
    context
  }) {
    return await fetchPosts(context);
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent() {
    return <PendingComponent />;
  },
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});
function PendingComponent() {
  return <div>Pending</div>;
}