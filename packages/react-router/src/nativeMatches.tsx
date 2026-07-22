'use client'

import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { CatchBoundary } from './nativeCatchBoundary'
import { useRouter } from './useRouter'
import { Transitioner } from './Transitioner'
import { matchContext } from './matchContext'
import { Match } from './Match'
import { SafeFragment } from './SafeFragment'
import type { AnyRoute } from '@tanstack/router-core'

/** Render matches from a renderer-owned router snapshot. */
export function Matches({
  includeTransitioner = false,
}: {
  includeTransitioner?: boolean
} = {}) {
  const router = useRouter()
  const rootRoute: AnyRoute = router.routesById[rootRouteId]
  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent
  const pendingElement = PendingComponent ? <PendingComponent /> : null
  const ResolvedSuspense =
    (isServer ?? router.isServer) ||
    (typeof document !== 'undefined' && router.ssr)
      ? SafeFragment
      : React.Suspense
  const inner = (
    <ResolvedSuspense fallback={pendingElement}>
      {includeTransitioner && !(isServer ?? router.isServer) ? (
        <Transitioner />
      ) : null}
      <MatchesInner />
    </ResolvedSuspense>
  )

  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

function MatchesInner() {
  const router = useRouter()
  const _isServer = isServer ?? router.isServer
  const matchId = _isServer
    ? router.stores.firstId.get()
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useStore(router.stores.firstId, (id) => id)
  const resetKey = _isServer
    ? router.stores.loadedAt.get()
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useStore(router.stores.loadedAt, (loadedAt) => loadedAt)
  const matchComponent = matchId ? <Match matchId={matchId} /> : null

  return (
    <matchContext.Provider value={matchId}>
      {router.options.disableGlobalCatchBoundary ? (
        matchComponent
      ) : (
        <CatchBoundary
          getResetKey={() => resetKey}
          errorComponent={router.options.defaultErrorComponent}
          onCatch={
            process.env.NODE_ENV !== 'production'
              ? (error) => {
                  console.warn(
                    `Warning: The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
                  )
                  console.warn(`Warning: ${error.message || error.toString()}`)
                }
              : undefined
          }
        >
          {matchComponent}
        </CatchBoundary>
      )}
    </matchContext.Provider>
  )
}
