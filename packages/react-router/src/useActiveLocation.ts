import { last } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useMatch } from './useMatch'
import { useRouterState } from './useRouterState'
import type { AnyRouteMatch } from '@tanstack/router-core'

export type UseLocationResult = {
  activeLocationMatch: AnyRouteMatch | undefined
  getFromPath: (from?: string) => string
}

export const useActiveLocation = (): UseLocationResult => {
  const router = useRouter()

  const currentRouteMatch = useMatch({
    strict: false,
    select: (match) => match,
  })

  const activeLocation = useRouterState({
    select: (s) => s.location,
    structuralSharing: true as any,
  })

  const activeLocationMatches = router.matchRoutes(activeLocation, {
    _buildLocation: false,
  })

  const activeLocationMatch = last(activeLocationMatches)

  const getFromPath = (from?: string) => {
    return from ?? activeLocationMatch?.fullPath ?? currentRouteMatch.fullPath
  }

  return { activeLocationMatch, getFromPath }
}
