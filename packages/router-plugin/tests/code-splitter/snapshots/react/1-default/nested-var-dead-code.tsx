const $$splitComponentImporter = () =>
  import('nested-var-dead-code.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { loadServerData } from './lib'
if (typeof window !== 'undefined') {
}
try {
  var loaderOnly = loadServerData()
} catch {}
if (typeof window !== 'undefined') {
}
export const Route = createFileRoute('/')({
  loader: () => loaderOnly,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
