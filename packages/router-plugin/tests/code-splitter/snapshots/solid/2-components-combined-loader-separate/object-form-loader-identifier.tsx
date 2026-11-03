const $$splitComponentImporter = () =>
  import('object-form-loader-identifier.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
const $$splitLoaderImporter = () =>
  import('object-form-loader-identifier.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/posts')({
  loader: { handler: lazyFn($$splitLoaderImporter, 'loader'), dehydrate: true },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
