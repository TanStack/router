const $$splitComponentImporter = () =>
  import('loader-object-arrow.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'
export const Route = createFileRoute('/posts/$postId')({
  loader: {
    staleReloadMode: 'blocking',
    handler: async ({ params }) => fetchPost(params.postId),
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
