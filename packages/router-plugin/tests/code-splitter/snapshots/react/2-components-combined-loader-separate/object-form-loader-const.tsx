const $$splitComponentImporter = () =>
  import('object-form-loader-const.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('object-form-loader-const.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
const postsLoader = {
  handler: lazyFn($$splitLoaderImporter, 'loader'),
  dehydrate: true,
}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
