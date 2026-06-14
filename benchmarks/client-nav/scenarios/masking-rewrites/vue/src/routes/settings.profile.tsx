import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

const SettingsProfilePage = Vue.defineComponent({
  setup() {
    return () => (
      <div data-route-marker={MASKING_ROUTE_MARKERS.settingsProfile} />
    )
  },
})

export const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.settingsProfile,
  component: SettingsProfilePage,
})
