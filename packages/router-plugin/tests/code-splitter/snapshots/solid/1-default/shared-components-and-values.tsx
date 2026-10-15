import { label, registry } from 'shared-components-and-values.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('shared-components-and-values.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  loader: () => label(registry.size),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
export {
  Card,
  Header,
  Table,
} from 'shared-components-and-values.tsx?tsr-shared=1'
