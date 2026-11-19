import { Show, createMemo } from 'solid-js'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

function formatTime(ms: number) {
  const units = ['s', 'min', 'h', 'd']
  const values = [ms / 1000, ms / 60000, ms / 3600000, ms / 86400000]

  let chosenUnitIndex = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < 1) break
    chosenUnitIndex = i
  }

  const formatter = new Intl.NumberFormat(navigator.language, {
    compactDisplay: 'short',
    notation: 'compact',
    maximumFractionDigits: 0,
  })

  return formatter.format(values[chosenUnitIndex]!) + units[chosenUnitIndex]
}

export function AgeTicker(props: {
  match?: AnyRouteMatch
  router: Accessor<AnyRouter>
}) {
  const ages = createMemo(() => {
    const match = props.match
    if (!match) {
      return undefined
    }

    const router = props.router()
    const route = (router.routesById as Record<string, AnyRoute | undefined>)[
      match.routeId
    ]

    // A history match can belong to a route the current router no longer has.
    if (!route?.options.loader) {
      return undefined
    }

    return {
      age: Date.now() - match.updatedAt,
      staleTime:
        route.options.staleTime ?? router.options.defaultStaleTime ?? 0,
      gcTime: route.options.gcTime ?? router.options.defaultGcTime ?? 300_000,
    }
  })

  return (
    <Show when={ages()}>
      {(ages) => (
        <div
          class={
            ages().age > ages().staleTime
              ? 'tsrd-age-ticker tsrd-age-ticker-warning'
              : 'tsrd-age-ticker'
          }
        >
          <div>{formatTime(ages().age)}</div>
          <div>/</div>
          <div>{formatTime(ages().staleTime)}</div>
          <div>/</div>
          <div>{formatTime(ages().gcTime)}</div>
        </div>
      )}
    </Show>
  )
}
