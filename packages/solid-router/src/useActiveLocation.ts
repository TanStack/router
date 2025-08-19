import { last } from '@tanstack/router-core'
import { createEffect, createSignal } from 'solid-js'
import * as Solid from 'solid-js'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import type { ParsedLocation } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'

export function useActiveLocation(location?: ParsedLocation) {
  const router = useRouter()
  const [activeLocation, setActiveLocation] = createSignal<ParsedLocation>(
    location ?? useRouterState({ select: (state) => state.location })(),
  )
  const [customActiveLocation, _setCustomActiveLocation] =
    createSignal<ParsedLocation>(
      location ?? useRouterState({ select: (state) => state.location })(),
    )
  const [useCustomActiveLocation, setUseCustomActiveLocation] =
    createSignal(!!location)

  createEffect(() => {
    if (!useCustomActiveLocation()) {
      setActiveLocation(useRouterState({ select: (state) => state.location }))
    } else {
      setActiveLocation(customActiveLocation())
    }
  })

  const setCustomActiveLocation = (location: ParsedLocation) => {
    _setCustomActiveLocation(location)
    setUseCustomActiveLocation(true)
  }

  const matchIndex = useMatch({
    strict: false,
    select: (match) => match.index,
  })

  const getFromPath = (from?: string) =>
    Solid.createMemo(() => {
      const currentRouteMatches = router.matchRoutes(activeLocation(), {
        _buildLocation: false,
      })

      return (
        from ??
        last(currentRouteMatches)?.fullPath ??
        router.state.matches[matchIndex()]!.fullPath
      )
    })

  return {
    activeLocation,
    getFromPath,
    setActiveLocation: setCustomActiveLocation,
  }
}
