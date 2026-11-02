import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
import type { ComponentType } from 'react'

/** Whose settings an installation shows, provided by its host route. */
export interface Owner {
  kind: 'organization' | 'person'
  id: string
  name: string
}

// The application installs the settings twice: below `/orgs/$orgId` and
// below `/people/$personId`. Each host route provides its owner.
export const Route = createModuleRoot<{
  owner: Owner
  onProfileMatch?: (routeId: string | undefined) => void
  profileLinks?: ComponentType
}>()({
  component: SettingsRoom,
  notFoundComponent: () => <p>MODULE_NOT_FOUND</p>,
})

// The module's region: a room tagged with the installation it renders and
// where that installation is mounted.
function SettingsRoom() {
  const { owner } = Route.useRouteContext()
  const match = Route.useMatch({
    select: ({ routeId, fullPath, pathname }) => ({
      installation: routeId.slice(0, routeId.indexOf(':')),
      fullPath,
      pathname,
    }),
  })
  return (
    <section className="room" data-route-module="@route-modules/settings">
      <p className="room-tag">
        {match.installation} <code>{match.fullPath}</code>
        <code className="resolved">→ {match.pathname}</code>
      </p>
      <h2>Settings of {owner.name}</h2>
      <Outlet />
    </section>
  )
}
