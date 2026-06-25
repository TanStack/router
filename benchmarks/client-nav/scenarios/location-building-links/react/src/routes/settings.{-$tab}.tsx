import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/{-$tab}')({
  component: SettingsPage,
})

function SettingsPage() {
  const params = Route.useParams()

  return <div data-route-marker="settings" data-tab={params.tab ?? 'none'} />
}
