const $$splitComponentImporter = () =>
  import('reexported-import.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Foo } from './foo'
export { Foo, Foo as Bar }
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
