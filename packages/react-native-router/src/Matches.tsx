import * as React from 'react'
import { rootRouteId } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Match } from './Match'
import { matchContext } from './matchContext'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { Transitioner } from './Transitioner'
import type { AnyRoute } from '@tanstack/router-core'
import type { NativeScreenOptions } from './route'

// Lazily load react-native-screens to avoid accessing native modules at module load time
let _Screen: any = null
let _ScreenStack: any = null
let _ScreenStackHeaderConfig: any = null
let _screensChecked = false
let _screensEnabled = false

function getScreenComponents() {
  if (!_screensChecked) {
    _screensChecked = true
    try {
      const screens = require('react-native-screens')
      if (!_screensEnabled && typeof screens.enableScreens === 'function') {
        screens.enableScreens(true)
        _screensEnabled = true
      }
      _Screen = screens.Screen
      _ScreenStack = screens.ScreenStack
      _ScreenStackHeaderConfig = screens.ScreenStackHeaderConfig
    } catch {
      // react-native-screens not installed, will use View-based rendering
    }
  }
  return {
    Screen: _Screen,
    ScreenStack: _ScreenStack,
    ScreenStackHeaderConfig: _ScreenStackHeaderConfig,
  }
}

/**
 * Internal component that renders the router's active match tree.
 * Uses View-based rendering (no native screen stack).
 */
export function Matches() {
  const router = useRouter()
  const rootRoute: AnyRoute = router.routesById[rootRouteId]

  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent

  const pendingElement = PendingComponent ? <PendingComponent /> : null

  const inner = (
    <React.Suspense fallback={pendingElement}>
      <Transitioner />
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
 * Map our animation option to react-native-screens stackAnimation
 */
function getStackAnimation(
  animation: NativeScreenOptions['animation'],
): string | undefined {
  if (!animation || animation === 'default') return undefined
  return animation
}

function getGestureEnabled(screen: ScreenEntry): boolean {
  if (typeof screen.gestureEnabled === 'boolean') {
    return screen.gestureEnabled
  }

  return (screen.presentation ?? 'push') === 'push'
}

interface ScreenEntry {
  pathname: string
  presentation?: NativeScreenOptions['presentation']
  gestureEnabled?: boolean
  animation?: NativeScreenOptions['animation']
}

/**
 * Native screen wrapper using react-native-screens.
 *
 * Provides native push/pop animations when navigating between routes.
 * Maintains a minimal screen stack to enable proper animation direction:
 * - Forward navigation: new screen slides in from right
 * - Back navigation: current screen slides out to right
 */
export function NativeScreenMatches() {
  const router = useRouter()

  // Lazily get screen components
  const { Screen, ScreenStack, ScreenStackHeaderConfig } = getScreenComponents()

  // Get current pathname and animation options from deepest screen match
  const currentScreen = useRouterState({
    select: (s): ScreenEntry => {
      const matches = s.matches
      // Find the deepest match that is a screen (not a layout/navigator)
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]!
        if (match.routeId === rootRouteId) continue
        const route = router.routesById[match.routeId] as AnyRoute
        const nativeOptions = (route.options as any)?.nativeOptions as
          | NativeScreenOptions
          | undefined
        // Skip routes with presentation: 'none' (these are layouts/navigators)
        if (nativeOptions?.presentation === 'none') continue
        return {
          pathname: s.location.pathname,
          presentation: nativeOptions?.presentation,
          gestureEnabled: nativeOptions?.gestureEnabled,
          animation: nativeOptions?.animation,
        }
      }
      return {
        pathname: s.location.pathname,
        presentation: undefined,
        gestureEnabled: undefined,
        animation: undefined,
      }
    },
  })

  const currentPathRef = React.useRef(currentScreen.pathname)

  // Track screen stack for proper animation direction
  const [screenStack, setScreenStack] = React.useState<Array<ScreenEntry>>(
    () => [currentScreen],
  )

  // Update stack when navigation happens
  React.useEffect(() => {
    setScreenStack((prev) => {
      // Check if navigating back to a screen in the stack
      const existingIndex = prev.findIndex(
        (s) => s.pathname === currentScreen.pathname,
      )

      if (existingIndex !== -1 && existingIndex < prev.length - 1) {
        // Going back - trim stack to this screen
        return prev.slice(0, existingIndex + 1)
      }

      // Check if same screen (no navigation)
      const top = prev[prev.length - 1]
      if (top?.pathname === currentScreen.pathname) {
        if (
          top.animation !== currentScreen.animation ||
          top.presentation !== currentScreen.presentation ||
          top.gestureEnabled !== currentScreen.gestureEnabled
        ) {
          const next = prev.slice()
          next[next.length - 1] = currentScreen
          return next
        }
        return prev
      }

      // Forward navigation - push new screen
      return [...prev, currentScreen]
    })
  }, [currentScreen.pathname])

  React.useEffect(() => {
    currentPathRef.current = currentScreen.pathname
  }, [currentScreen.pathname])

  const rootRoute: AnyRoute = router.routesById[rootRouteId]
  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent
  const pendingElement = PendingComponent ? <PendingComponent /> : null

  // If react-native-screens is not available, fall back to View-based rendering
  if (!ScreenStack || !Screen) {
    return <Matches />
  }

  return (
    <ScreenStack style={styles.container}>
      {screenStack.map((screen, index) => {
        const isTop = index === screenStack.length - 1
        const stackAnimation = getStackAnimation(screen.animation)

        return (
          <Screen
            key={screen.pathname}
            style={styles.screen}
            stackPresentation={screen.presentation ?? 'push'}
            stackAnimation={stackAnimation}
            gestureEnabled={getGestureEnabled(screen)}
            onDismissed={() => {
              if (screen.pathname !== currentPathRef.current) {
                return
              }
              if (router.history.canGoBack()) {
                router.history.back()
              }
            }}
          >
            <ScreenStackHeaderConfig hidden />
            {isTop ? (
              <React.Suspense fallback={pendingElement}>
                <Matches />
              </React.Suspense>
            ) : null}
          </Screen>
        )
      })}
    </ScreenStack>
  )
}

// Lazy styles to avoid accessing native modules at module load time
let _styles: { container: object; screen: object } | null = null
function getStyles() {
  if (!_styles) {
    const { StyleSheet } = require('react-native')
    _styles = StyleSheet.create({
      container: {
        flex: 1,
      },
      screen: {
        flex: 1,
      },
    })
  }
  return _styles!
}

const styles = {
  get container() {
    return getStyles().container
  },
  get screen() {
    return getStyles().screen
  },
}
