import { Outlet, createRootRoute } from '@tanstack/react-router'
import { normalizeMaskingSearch } from '../../../shared.ts'
import { LinkPanel } from '../link-panel'

export const rootRoute = createRootRoute({
  validateSearch: normalizeMaskingSearch,
  component: Root,
})

function Root() {
  return (
    <>
      <LinkPanel />
      <main>
        <Outlet />
      </main>
    </>
  )
}
