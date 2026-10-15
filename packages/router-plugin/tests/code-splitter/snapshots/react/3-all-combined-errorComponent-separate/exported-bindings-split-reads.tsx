const $$splitComponentImporter = () =>
  import('exported-bindings-split-reads.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('exported-bindings-split-reads.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export function RouteTitle() {
  return <h1>{Route.useLoaderData().title}</h1>
}
export const Route = createFileRoute('/')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
export {
  Store,
  countRender,
} from 'exported-bindings-split-reads.tsx?tsr-shared=1'
export { Card } from 'exported-bindings-split-reads.tsx?tsr-shared=components'
