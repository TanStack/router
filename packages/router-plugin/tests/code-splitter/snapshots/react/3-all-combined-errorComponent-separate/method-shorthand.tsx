import { obj } from "method-shorthand.tsx?tsr-shared=1";
const $$splitErrorComponentImporter = () => import('method-shorthand.tsx?tsr-split=errorComponent');
const $$splitNotFoundComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitPendingComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('method-shorthand.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
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
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});