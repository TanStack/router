import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { ScenarioPage } from '~/components/ScenarioPage'
import { SsrInteractiveTable } from '~/components/SsrInteractiveTable'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/ssr-defer-interaction')({
  validateSearch: normalizeBenchmarkSearch,
  component: SsrDeferInteractionRoute,
})

function SsrDeferInteractionRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="ssr-defer-interaction" settings={settings}>
      <Hydrate when={interaction({ events: 'click' })}>
        <SsrInteractiveTable points={settings.points} />
      </Hydrate>
    </ScenarioPage>
  )
}
