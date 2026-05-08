import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { ScenarioPage } from '~/components/ScenarioPage'
import { SsrInteractiveTable } from '~/components/SsrInteractiveTable'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/ssr-defer-runtime-only')({
  validateSearch: normalizeBenchmarkSearch,
  component: SsrDeferRuntimeOnlyRoute,
})

function SsrDeferRuntimeOnlyRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="ssr-defer-runtime-only" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })} split={false}>
        <SsrInteractiveTable points={settings.points} />
      </Hydrate>
    </ScenarioPage>
  )
}
