const $$splitComponentImporter = () =>
  import('loader-held-function.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
// a function the compiler can see: split without the object-form mark
const loadPosts = async () => fetchPosts()
export const Route = createFileRoute('/posts')({
  loader: loadPosts,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
