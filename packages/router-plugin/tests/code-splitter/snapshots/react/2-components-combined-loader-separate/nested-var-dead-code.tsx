const $$splitComponentImporter = () =>
  import('nested-var-dead-code.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('nested-var-dead-code.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
if (typeof window !== 'undefined') {
}
try {
} catch {}
if (typeof window !== 'undefined') {
}
export const Route = createFileRoute('/')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
