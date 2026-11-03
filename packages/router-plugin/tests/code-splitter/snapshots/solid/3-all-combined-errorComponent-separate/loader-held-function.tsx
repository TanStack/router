const $$splitComponentImporter = () =>
  import('loader-held-function.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
const $$splitLoaderImporter = () =>
  import('loader-held-function.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
// a function the compiler can see: split without the object-form mark
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
