import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { createHeadLoaderData, createSettingsHead } from '../../../shared.ts'
import { Route as headRoute } from './head'

const SettingsPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()
    const loaderData = Route.useLoaderData()

    return () => (
      <div
        data-route-marker="settings"
        data-tab={params.value.tab ?? 'none'}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => headRoute,
  path: 'settings/{-$tab}',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('settings', params.tab ?? 'general', deps),
  head: ({ params, loaderData }) => createSettingsHead(params.tab, loaderData!),
  component: SettingsPage,
})
