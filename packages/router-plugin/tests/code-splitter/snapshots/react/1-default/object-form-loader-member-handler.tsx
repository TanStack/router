const $$splitComponentImporter = () =>
  import('object-form-loader-member-handler.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { postsApi } from '../posts'
export const Route = createFileRoute('/posts')({
  loader: { handler: postsApi.list, staleReloadMode: 'background' },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
