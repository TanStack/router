const $$splitComponentImporter = () =>
  import('loader-object-imported.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('loader-object-imported.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: lazyFn($$splitLoaderImporter, 'loader'),
    staleReloadMode: 'background',
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
