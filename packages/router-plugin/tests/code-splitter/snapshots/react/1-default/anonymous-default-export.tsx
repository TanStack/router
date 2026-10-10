import { cache } from 'anonymous-default-export.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('anonymous-default-export.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => cache.get('title'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
export default function () {
  return null
}
