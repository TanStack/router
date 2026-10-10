const $$splitComponentImporter = () =>
  import('anonymous-default-export.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('anonymous-default-export.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
export default function () {
  return null
}
