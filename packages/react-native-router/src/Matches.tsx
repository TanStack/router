import * as React from 'react'
import { View, StyleSheet } from 'react-native'
import { rootRouteId } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Match } from './Match'
import { matchContext } from './matchContext'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { SafeFragment } from './SafeFragment'
import type { AnyRoute } from '@tanstack/router-core'

// Optional: Import react-native-screens if available
let Screen: any
let ScreenStack: any
let ScreenStackHeaderConfig: any

try {
  const screens = require('react-native-screens')
  Screen = screens.Screen
  ScreenStack = screens.ScreenStack
  ScreenStackHeaderConfig = screens.ScreenStackHeaderConfig
} catch {
  // react-native-screens not installed, will use View-based rendering
}

/**
 * Internal component that renders the router's active match tree.
 * Uses react-native-screens if available for native stack navigation.
 */
export function Matches() {
  const router = useRouter()
  const rootRoute: AnyRoute = router.routesById[rootRouteId]

  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent

  const pendingElement = PendingComponent ? <PendingComponent /> : null

  const inner = (
    <React.Suspense fallback={pendingElement}>
      <MatchesInner />
    </React.Suspense>
  )

  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

function MatchesInner() {
  const router = useRouter()
  const matchId = useRouterState({
    select: (s) => s.matches[0]?.id,
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  const matchComponent = matchId ? <Match matchId={matchId} /> : null

  return (
    <matchContext.Provider value={matchId}>
      {router.options.disableGlobalCatchBoundary ? (
        matchComponent
      ) : (
        <CatchBoundary
          getResetKey={() => resetKey}
          errorComponent={ErrorComponent}
          onCatch={(error) => {
            console.warn(
              `The following error wasn't caught by any route! Consider setting an 'errorComponent' in your RootRoute!`,
            )
            console.warn(error.message || error.toString())
          }}
        >
          {matchComponent}
        </CatchBoundary>
      )}
    </matchContext.Provider>
  )
}

/**
 * Alternative renderer using react-native-screens for native stack navigation.
 * Each route match at the top level becomes a separate screen.
 */
export function NativeScreenMatches() {
  const router = useRouter()

  // Get only the "leaf" matches that should be separate screens
  // For nested routes, they render inside their parent via Outlet
  const screenMatches = useRouterState({
    select: (s) => {
      // For now, we render each top-level match as a screen
      // Nested routes render via Outlet pattern inside their parent
      return s.matches.map((m) => ({
        id: m.id,
        routeId: m.routeId,
      }))
    },
    structuralSharing: true as any,
  })

  const resetKey = useRouterState({
    select: (s) => s.loadedAt,
  })

  // If react-native-screens is not available, fall back to View-based rendering
  if (!ScreenStack || !Screen) {
    return (
      <View style={styles.container}>
        <Matches />
      </View>
    )
  }

  const handleDismissed = React.useCallback(() => {
    // When user swipes back on iOS, sync router state
    if (router.history.canGoBack()) {
      router.history.back()
    }
  }, [router])

  // Only render the first match as a screen (the root)
  // Nested matches render via Outlet
  const rootMatchId = screenMatches[0]?.id

  if (!rootMatchId) {
    return null
  }

  return (
    <ScreenStack style={styles.container}>
      <Screen
        key={rootMatchId}
        style={styles.screen}
        stackPresentation="push"
        onDismissed={handleDismissed}
      >
        <ScreenStackHeaderConfig hidden />
        <CatchBoundary
          getResetKey={() => resetKey}
          errorComponent={ErrorComponent}
          onCatch={(error) => {
            console.warn(
              `The following error wasn't caught by any route! Consider setting an 'errorComponent' in your RootRoute!`,
            )
            console.warn(error.message || error.toString())
          }}
        >
          <matchContext.Provider value={rootMatchId}>
            <Match matchId={rootMatchId} />
          </matchContext.Provider>
        </CatchBoundary>
      </Screen>
    </ScreenStack>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
})
