const $$splitComponentImporter = () =>
  import('object-form-loader-const.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
const postsLoader = { handler: () => fetchPosts(), dehydrate: true }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
