const $$splitNotFoundComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
const $$splitErrorComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=errorComponent')
const $$splitComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent(
    $$splitErrorComponentImporter,
    'errorComponent',
  ),
  notFoundComponent: lazyRouteComponent(
    $$splitNotFoundComponentImporter,
    'notFoundComponent',
  ),
} satisfies RouteOptions)
