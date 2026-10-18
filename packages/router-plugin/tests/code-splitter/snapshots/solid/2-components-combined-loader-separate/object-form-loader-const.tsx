const $$splitComponentImporter = () =>
  import('object-form-loader-const.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
const postsLoader = { handler: () => fetchPosts(), dehydrate: true }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
