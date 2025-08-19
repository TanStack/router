import { last } from '@tanstack/router-core'
import { createEffect, createMemo, createSignal } from 'solid-js'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { Accessor } from 'solid-js'
import type { ParsedLocation } from '@tanstack/router-core'

export type UseLocationResult = {
  activeLocation: Accessor<ParsedLocation>
  getFromPath: (from?: string) => Accessor<string>
  setActiveLocation: (location?: ParsedLocation) => void
}

export function useActiveLocation(
  location?: ParsedLocation,
): UseLocationResult {
  const router = useRouter()
  // we are not using a variable here for router state location since we need to only calculate that if the location is not passed in. It can result in unnecessary history actions if we do that.
  const [activeLocation, setActiveLocation] = createSignal<ParsedLocation>(
    location ?? useRouterState({ select: (s) => s.location })(),
  )
  const [customActiveLocation, setCustomActiveLocation] = createSignal<
    ParsedLocation | undefined
  >(location)

  createEffect(() => {
    setActiveLocation(
      customActiveLocation() ?? useRouterState({ select: (s) => s.location })(),
    )
  })

  const matchIndex = useMatch({
    strict: false,
    select: (match) => match.index,
  })

  const getFromPath = (from?: string) =>
    createMemo(() => {
      const activeLocationMatches = router.matchRoutes(
        customActiveLocation() ?? activeLocation(),
        {
          _buildLocation: false,
        },
      )

      const activeLocationMatch = last(activeLocationMatches)

      return (
        from ??
        activeLocationMatch?.fullPath ??
        router.state.matches[matchIndex()]!.fullPath
      )
    })

  return {
    activeLocation,
    getFromPath,
    setActiveLocation: setCustomActiveLocation,
  }
}
