import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'
import { createPortal } from 'react-dom'
import { normalizeHeadSearch } from '../../../shared.ts'

export const Route = createRootRoute({
  validateSearch: normalizeHeadSearch,
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      {createPortal(<HeadContent />, document.head)}
      <Outlet />
    </>
  )
}
