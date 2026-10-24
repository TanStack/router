const $$splitComponentImporter = () =>
  import('object-form-loader-identifier.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
function loadPosts() {
  return fetchPosts()
}
export const Route = createFileRoute('/posts')({
  loader: { handler: loadPosts, dehydrate: true },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
