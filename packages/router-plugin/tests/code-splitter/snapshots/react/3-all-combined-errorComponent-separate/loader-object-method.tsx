import { reloadMode } from 'loader-object-method.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('loader-object-method.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('loader-object-method.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: {
    staleReloadMode: reloadMode,
    handler: lazyFn($$splitLoaderImporter, 'loader'),
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
