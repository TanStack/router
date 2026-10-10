/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
const $$splitErrorComponentImporter = () =>
  import('jsx-pragmas.tsx?tsr-split=errorComponent')
const $$splitComponentImporter = () =>
  import('jsx-pragmas.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
const $$splitLoaderImporter = () =>
  import('jsx-pragmas.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/styled')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent(
    $$splitErrorComponentImporter,
    'errorComponent',
  ),
})
