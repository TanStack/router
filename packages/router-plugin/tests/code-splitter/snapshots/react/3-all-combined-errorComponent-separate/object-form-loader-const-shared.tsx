import { postsLoader } from 'object-form-loader-const-shared.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('object-form-loader-const-shared.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
