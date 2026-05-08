import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { ScenarioPage } from '~/components/ScenarioPage'
import { SsrInteractiveTable } from '~/components/SsrInteractiveTable'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/ssr-defer-visible')({
  validateSearch: normalizeBenchmarkSearch,
  component: SsrDeferVisibleRoute,
})

function SsrDeferVisibleRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="ssr-defer-visible" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })}>
        <SsrInteractiveTable points={settings.points} />
      </Hydrate>
    </ScenarioPage>
  )
}
