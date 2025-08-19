import { last } from '@tanstack/router-core'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from './useRouter'
import { useMatch } from './useMatch'
import type { AnyRouteMatch, ParsedLocation } from '@tanstack/router-core'

export type UseLocationResult = {
  activeLocationMatch: AnyRouteMatch | undefined
  getFromPath: (from?: string) => string
}

export const useActiveLocation = (location?: ParsedLocation) => {
  const { matchRoutes, state } = useRouter()
  const [activeLocation, setActiveLocation] = useState<ParsedLocation>(
    location ?? state.location,
  )
  const [customActiveLocation, _setCustomActiveLocation] =
    useState<ParsedLocation>(location ?? state.location)
  const [useCustomActiveLocation, setUseCustomActiveLocation] =
    useState(!!location)

  useEffect(() => {
    if (!useCustomActiveLocation) {
      setActiveLocation(state.location)
    } else {
      setActiveLocation(customActiveLocation)
    }
  }, [state.location, useCustomActiveLocation, customActiveLocation])

  const setCustomActiveLocation = (location: ParsedLocation) => {
    _setCustomActiveLocation(location)
    setUseCustomActiveLocation(true)
  }

  const currentRouteMatch = useMatch({
    strict: false,
    select: (match) => match,
  })

  const getFromPath = useCallback(
    (from?: string) => {
      const activeLocationMatches = matchRoutes(activeLocation, {
        _buildLocation: false,
      })

      const activeLocationMatch = last(activeLocationMatches)

      return from ?? activeLocationMatch?.fullPath ?? currentRouteMatch.fullPath
    },
    [activeLocation, currentRouteMatch.fullPath, matchRoutes],
  )

  return {
    activeLocation,
    getFromPath,
    setActiveLocation: setCustomActiveLocation,
  }
}
