const $$splitComponentImporter = () =>
  import('loader-object-arrow.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('loader-object-arrow.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/$postId')({
  loader: {
    staleReloadMode: 'blocking',
    handler: lazyFn($$splitLoaderImporter, 'loader'),
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
