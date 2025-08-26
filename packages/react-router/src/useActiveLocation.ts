import { last } from '@tanstack/router-core'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from './useRouter'
import { useMatch } from './useMatch'
import { useRouterState } from './useRouterState'
import type { ParsedLocation } from '@tanstack/router-core'

export type UseActiveLocationResult = {
  activeLocation: ParsedLocation
  getFromPath: (from?: string) => string
  setActiveLocation: (location?: ParsedLocation) => void
}

export const useActiveLocation = (
  location?: ParsedLocation,
): UseActiveLocationResult => {
  const router = useRouter()
  const routerLocation = useRouterState({ select: (state) => state.location })
  const [activeLocation, setActiveLocation] = useState<ParsedLocation>(
    location ?? routerLocation,
  )
  const [customActiveLocation, setCustomActiveLocation] = useState<
    ParsedLocation | undefined
  >(location)

  useEffect(() => {
    setActiveLocation(customActiveLocation ?? routerLocation)
  }, [routerLocation, customActiveLocation])

  const matchIndex = useMatch({
    strict: false,
    select: (match) => match.index,
  })

  const getFromPath = useCallback(
    (from?: string) => {
      const activeLocationMatches = router.matchRoutes(activeLocation, {
        _buildLocation: false,
      })

      const activeLocationMatch = last(activeLocationMatches)

      return (
        from ??
        activeLocationMatch?.fullPath ??
        router.state.matches[matchIndex]!.fullPath
      )
    },
    [activeLocation, matchIndex, router],
  )

  return {
    activeLocation,
    getFromPath,
    setActiveLocation: setCustomActiveLocation,
  }
}
