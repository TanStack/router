import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { BenchmarkScenario } from '~/components/BenchmarkScenario'
import { ScenarioPage } from '~/components/ScenarioPage'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/defer-visible')({
  validateSearch: normalizeBenchmarkSearch,
  component: DeferVisibleRoute,
})

function DeferVisibleRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="defer-visible" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })}>
        <BenchmarkScenario variant="defer-visible" settings={settings} />
      </Hydrate>
    </ScenarioPage>
  )
}
