const $$splitComponentImporter = () =>
  import('object-form-loader.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
import { toWire } from '../server-only'
import { fromWire } from '../client-only'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: () => fetchPosts(),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    staleReloadMode: 'background',
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
