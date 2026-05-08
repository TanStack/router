import { createFileRoute } from '@tanstack/react-router'
import { BenchmarkScenario } from '~/components/BenchmarkScenario'
import { ScenarioPage } from '~/components/ScenarioPage'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/full')({
  validateSearch: normalizeBenchmarkSearch,
  component: FullRoute,
})

function FullRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="full" settings={settings}>
      <BenchmarkScenario variant="full" settings={settings} />
    </ScenarioPage>
  )
}
