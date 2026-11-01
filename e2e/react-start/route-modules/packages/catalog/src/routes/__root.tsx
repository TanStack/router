export type {} from '../requirements'
import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({
  component: CatalogRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted.
function CatalogRoom() {
  return (
    <section className="room" data-route-module="@start-route-modules/catalog">
      <p className="room-tag">
        @start-route-modules/catalog <code>{Route.fullPath}</code>
      </p>
      <h2>Catalog</h2>
      <Outlet />
    </section>
  )
}
