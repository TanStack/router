const $$splitComponentImporter = () =>
  import('loader-object-method.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
const reloadMode = 'blocking'
export const Route = createFileRoute('/posts')({
  loader: {
    staleReloadMode: reloadMode,
    async handler({ abortController }) {
      const posts = await fetchPosts({ signal: abortController.signal })
      return { posts, reloadMode }
    },
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
