const $$splitNotFoundComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
const $$splitErrorComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
const $$splitComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=loader')
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
