const $$splitComponentImporter = () =>
  import('loader-held-call-result.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
const $$splitLoaderImporter = () =>
  import('loader-held-call-result.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
// a call result may be an object-form loader: split with the mark
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
