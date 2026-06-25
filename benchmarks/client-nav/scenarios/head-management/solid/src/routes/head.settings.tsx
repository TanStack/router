import { createRoute } from '@tanstack/solid-router'
import { createHeadLoaderData, createSettingsHead } from '../../../shared.ts'
import { Route as headRoute } from './head'

export const Route = createRoute({
  getParentRoute: () => headRoute,
  path: 'settings/{-$tab}',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('settings', params.tab ?? 'general', deps),
  head: ({ params, loaderData }) => createSettingsHead(params.tab, loaderData!),
  component: SettingsPage,
})

function SettingsPage() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()

  return (
    <div
      data-route-marker="settings"
      data-tab={params().tab ?? 'none'}
      data-head-checksum={loaderData().checksum}
    />
  )
}
