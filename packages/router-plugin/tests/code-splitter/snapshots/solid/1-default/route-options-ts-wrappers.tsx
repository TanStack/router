const $$splitNotFoundComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=notFoundComponent')
const $$splitErrorComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=errorComponent')
const $$splitComponentImporter = () =>
  import('route-options-ts-wrappers.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent(
    $$splitErrorComponentImporter,
    'errorComponent',
  ),
  notFoundComponent: lazyRouteComponent(
    $$splitNotFoundComponentImporter,
    'notFoundComponent',
  ),
} satisfies RouteOptions)
