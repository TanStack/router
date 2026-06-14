import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const SettingsPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <div data-route-marker="settings" data-tab={params.value.tab ?? 'none'} />
    )
  },
})

export const Route = createFileRoute('/settings/{-$tab}')({
  component: SettingsPage,
})
