const $$splitComponentImporter = () =>
  import('inline-define-component.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/vue-router'
import { createFileRoute } from '@tanstack/vue-router'
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
