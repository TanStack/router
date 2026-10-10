import { obj } from "method-shorthand.tsx?tsr-shared=1";
const $$splitNotFoundComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitPendingComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('method-shorthand.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  beforeLoad() {
    console.log(obj);
  },
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent'),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent'),
  errorComponent() {
    super.test;
    return <ErrorComponent />;
  }
});
function ErrorComponent() {
  return <div>Error</div>;
}