import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { idle, visible } from '@tanstack/react-start/hydration'
import { BenchmarkScenario } from '~/components/BenchmarkScenario'
import { ScenarioPage } from '~/components/ScenarioPage'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/defer-visible-prefetch')({
  validateSearch: normalizeBenchmarkSearch,
  component: DeferVisiblePrefetchRoute,
})

function DeferVisiblePrefetchRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="defer-visible-prefetch" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })} prefetch={idle()}>
        <BenchmarkScenario
          variant="defer-visible-prefetch"
          settings={settings}
        />
      </Hydrate>
    </ScenarioPage>
  )
}
