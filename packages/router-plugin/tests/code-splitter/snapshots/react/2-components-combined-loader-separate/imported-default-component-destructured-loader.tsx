const $$splitComponentImporter = () =>
  import('imported-default-component-destructured-loader.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { importedLoader } from '../../shared/imported'
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  loader: importedLoader,
})
