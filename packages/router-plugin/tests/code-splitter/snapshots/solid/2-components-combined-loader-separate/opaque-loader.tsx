const $$splitComponentImporter = () =>
  import('opaque-loader.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { makeLoader } from './loader'
const options = {
  loader: makeLoader(),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
}
export const Route = createFileRoute('/posts')(options)
