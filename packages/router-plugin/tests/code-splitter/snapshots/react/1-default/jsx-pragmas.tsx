/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
import { icon } from 'jsx-pragmas.tsx?tsr-shared=1'
const $$splitErrorComponentImporter = () =>
  import('jsx-pragmas.tsx?tsr-split=errorComponent')
const $$splitComponentImporter = () =>
  import('jsx-pragmas.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { fetchTheme } from '../theme'
export const Route = createFileRoute('/styled')({
  loader: async () => ({ icon, theme: await fetchTheme() }),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent(
    $$splitErrorComponentImporter,
    'errorComponent',
  ),
})
