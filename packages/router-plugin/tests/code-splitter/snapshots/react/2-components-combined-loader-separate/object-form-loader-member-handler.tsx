const $$splitComponentImporter = () =>
  import('object-form-loader-member-handler.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('object-form-loader-member-handler.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: lazyFn($$splitLoaderImporter, 'loader'),
    staleReloadMode: 'background',
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
