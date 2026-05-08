import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { BenchmarkScenario } from '~/components/BenchmarkScenario'
import { ScenarioPage } from '~/components/ScenarioPage'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/defer-runtime-only')({
  validateSearch: normalizeBenchmarkSearch,
  component: DeferRuntimeOnlyRoute,
})

function DeferRuntimeOnlyRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="defer-runtime-only" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })} split={false}>
        <BenchmarkScenario variant="defer-runtime-only" settings={settings} />
      </Hydrate>
    </ScenarioPage>
  )
}
