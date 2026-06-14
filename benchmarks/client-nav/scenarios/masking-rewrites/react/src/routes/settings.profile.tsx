import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'

export const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: SettingsProfilePage,
})

function SettingsProfilePage() {
  return <div data-route-marker="settings-profile" />
}
