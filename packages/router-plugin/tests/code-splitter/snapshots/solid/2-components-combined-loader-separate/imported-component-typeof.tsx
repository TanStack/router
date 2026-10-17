const $$splitComponentImporter = () =>
  import('imported-component-typeof.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
const $$splitLoaderImporter = () =>
  import('imported-component-typeof.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
type PostsData = Awaited<ReturnType<typeof fetchPosts>>
type PostsProps = Parameters<typeof PostsComponent>[0]
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
