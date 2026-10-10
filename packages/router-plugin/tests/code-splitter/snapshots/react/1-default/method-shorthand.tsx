import { obj } from "method-shorthand.tsx?tsr-shared=1";
const $$splitNotFoundComponentImporter = () => import('method-shorthand.tsx?tsr-split=notFoundComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/')({
  beforeLoad() {
    console.log(obj);
  },
  async loader({
    context
  }) {
    return await fetchPosts(context, obj);
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent() {
    return <PendingComponent />;
  },
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent'),
  errorComponent() {
    super.test;
    return <ErrorComponent />;
  }
});
function PendingComponent() {
  return <div>Pending {obj.name}</div>;
}
function ErrorComponent() {
  return <div>Error</div>;
}