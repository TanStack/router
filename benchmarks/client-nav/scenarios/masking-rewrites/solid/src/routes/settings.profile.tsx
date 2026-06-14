import { createRoute } from '@tanstack/solid-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

export const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.settingsProfile,
  component: SettingsProfilePage,
})

function SettingsProfilePage() {
  return <div data-route-marker={MASKING_ROUTE_MARKERS.settingsProfile} />
}
