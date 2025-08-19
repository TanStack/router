import { last } from '@tanstack/router-core'
import {  createMemo } from 'solid-js'
import { useRouterState } from './useRouterState'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import type {Accessor} from 'solid-js';
import type { AnyRouteMatch} from '@tanstack/router-core'

export type UseActiveLocationResult = { activeLocationMatch: Accessor<AnyRouteMatch | undefined>, getFromPath: (from?: string) => Accessor<string> }

export function useActiveLocation(): UseActiveLocationResult {
  const router = useRouter()

  const currentRouteMatch = useMatch({
    strict: false,
    select: (match) => match,
  })

  const activeLocation = useRouterState({
    select: (s) => s.location
  })

  const activeLocationMatch = createMemo(() => {
    const activeLocationMatches = router.matchRoutes(activeLocation(), {
      _buildLocation: false,
    })

    return last(activeLocationMatches)
  })




  const getFromPath = (from?: string) => {
    return createMemo(() => from ?? activeLocationMatch()?.fullPath ?? currentRouteMatch().fullPath)
  }

  return { activeLocationMatch, getFromPath }
}
