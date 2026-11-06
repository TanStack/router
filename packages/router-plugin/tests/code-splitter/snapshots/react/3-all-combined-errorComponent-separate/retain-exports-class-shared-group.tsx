console.warn(
  '[tanstack-router] These exports from "retain-exports-class-shared-group.tsx" will not be code-split and will increase your bundle size:\n- Layout\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
)
const $$splitLoaderImporter = () =>
  import('retain-exports-class-shared-group.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyFn } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
export class Layout extends React.Component {
  render() {
    return (
      <main>
        <Outlet />
      </main>
    )
  }
}
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: lazyFn($$splitLoaderImporter, 'loader'),
})
