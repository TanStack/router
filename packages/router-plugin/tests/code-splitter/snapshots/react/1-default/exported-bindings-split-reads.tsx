const $$splitComponentImporter = () =>
  import('exported-bindings-split-reads.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export function RouteTitle() {
  return <h1>{Route.useLoaderData().title}</h1>
}
export const Route = createFileRoute('/')({
  loader: () => ({ title: 'Home' }),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
export {
  Card,
  Store,
  countRender,
} from 'exported-bindings-split-reads.tsx?tsr-shared=1'
