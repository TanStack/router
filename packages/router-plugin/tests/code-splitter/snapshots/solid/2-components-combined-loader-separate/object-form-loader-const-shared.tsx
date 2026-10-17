import { postsLoader } from 'object-form-loader-const-shared.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('object-form-loader-const-shared.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
