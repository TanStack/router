const $$splitComponentImporter = () =>
  import('object-form-loader-identifier.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('object-form-loader-identifier.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: { handler: lazyFn($$splitLoaderImporter, 'loader'), dehydrate: true },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
