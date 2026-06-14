import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { rootRoute } from './__root'

const SettingsProfilePage = Vue.defineComponent({
  setup() {
    return () => <div data-route-marker="settings-profile" />
  },
})

export const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: SettingsProfilePage,
})
