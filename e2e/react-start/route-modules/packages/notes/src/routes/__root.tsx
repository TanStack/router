import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({ component: NotesRoom })

// The module's region: a room tagged with its package and where it is
// mounted.
function NotesRoom() {
  return (
    <section className="room" data-route-module="@start-route-modules/notes">
      <p className="room-tag">
        @start-route-modules/notes <code>{Route.fullPath}</code>
      </p>
      <h2>Notes</h2>
      <Outlet />
    </section>
  )
}
