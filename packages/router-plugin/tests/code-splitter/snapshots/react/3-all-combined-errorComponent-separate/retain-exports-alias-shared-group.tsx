console.warn(
  '[tanstack-router] These exports from "retain-exports-alias-shared-group.tsx" will not be code-split and will increase your bundle size:\n- Layout\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
)
const $$splitLoaderImporter = () =>
  import('retain-exports-alias-shared-group.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
export { Layout as PublicLayout }
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: lazyFn($$splitLoaderImporter, 'loader'),
})
