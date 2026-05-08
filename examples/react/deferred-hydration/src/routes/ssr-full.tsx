import { createFileRoute } from '@tanstack/react-router'
import { ScenarioPage } from '~/components/ScenarioPage'
import { SsrInteractiveTable } from '~/components/SsrInteractiveTable'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/ssr-full')({
  validateSearch: normalizeBenchmarkSearch,
  component: SsrFullRoute,
})

function SsrFullRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="ssr-full" settings={settings}>
      <SsrInteractiveTable points={settings.points} />
    </ScenarioPage>
  )
}
