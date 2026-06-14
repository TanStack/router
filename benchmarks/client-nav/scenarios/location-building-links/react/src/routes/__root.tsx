import { Outlet, createRootRoute } from '@tanstack/react-router'
import { normalizeRootSearch } from '../../../shared.ts'
import { LinkPanel } from '../link-panel'

export const Route = createRootRoute({
  validateSearch: normalizeRootSearch,
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <LinkPanel />
      <main>
        <Outlet />
      </main>
    </>
  )
}
