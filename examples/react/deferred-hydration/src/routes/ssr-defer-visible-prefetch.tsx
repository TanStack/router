import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { idle, visible } from '@tanstack/react-start/hydration'
import { ScenarioPage } from '~/components/ScenarioPage'
import { SsrInteractiveTable } from '~/components/SsrInteractiveTable'
import { normalizeBenchmarkSearch } from '~/benchmark'

export const Route = createFileRoute('/ssr-defer-visible-prefetch')({
  validateSearch: normalizeBenchmarkSearch,
  component: SsrDeferVisiblePrefetchRoute,
})

function SsrDeferVisiblePrefetchRoute() {
  const settings = Route.useSearch()

  return (
    <ScenarioPage variant="ssr-defer-visible-prefetch" settings={settings}>
      <Hydrate when={visible({ rootMargin: '0px' })} prefetch={idle()}>
        <SsrInteractiveTable points={settings.points} />
      </Hydrate>
    </ScenarioPage>
  )
}
