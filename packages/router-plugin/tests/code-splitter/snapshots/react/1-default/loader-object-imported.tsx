const $$splitComponentImporter = () =>
  import('loader-object-imported.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { loadPosts } from '../posts'
export const Route = createFileRoute('/posts')({
  loader: { handler: loadPosts, staleReloadMode: 'background' },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
