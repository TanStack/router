import { HeadContent, Outlet, createRootRoute } from '@tanstack/solid-router'
import { normalizeHeadSearch } from '../../../shared.ts'

export const Route = createRootRoute({
  validateSearch: normalizeHeadSearch,
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  )
}
