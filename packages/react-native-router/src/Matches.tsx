import * as React from 'react'
import { rootRouteId } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Match } from './Match'
import { matchContext } from './matchContext'
import { routerStateContext } from './routerStateContext'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { Transitioner } from './Transitioner'
import type { AnyRoute, RouterState } from '@tanstack/router-core'
import type {
  NativeRouteOptions,
  NativeStackState,
  NativeStackStateResolverContext,
} from './route'

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
  return <MatchesImpl includeTransitioner />
}

function MatchesImpl({
  includeTransitioner,
}: {
  includeTransitioner: boolean
}) {
  const router = useRouter()
  const rootRoute: AnyRoute = router.routesById[rootRouteId]

  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent

  const pendingElement = PendingComponent ? <PendingComponent /> : null

  const inner = (
    <React.Suspense fallback={pendingElement}>
      {includeTransitioner ? <Transitioner /> : null}
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
  animation: NativeRouteOptions['animation'],
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
  locationKey: string
  historyIndex: number
  params: Record<string, string>
  search: unknown
  state: RouterState<AnyRoute>
  revision: number
  stackState?: NativeRouteOptions['stackState']
  resolvedStackState: NativeStackState
  presentation?: NativeRouteOptions['presentation']
  gestureEnabled?: boolean
  animation?: NativeRouteOptions['animation']
}

function resolveStackState(
  entry: ScreenEntry,
  ctx: NativeStackStateResolverContext,
  fallback: NativeStackState,
): NativeStackState {
  const option = entry.stackState

  if (!option) {
    return fallback
  }

  if (typeof option === 'function') {
    return option(ctx)
  }

  return option
}

function applyStackStates(
  stack: Array<ScreenEntry>,
  navigationType: NativeStackStateResolverContext['navigationType'],
): Array<ScreenEntry> {
  if (!stack.length) return stack

  const lastIndex = stack.length - 1
  const next = stack.map((entry, index) => {
    const depth = lastIndex - index
    const fallbackState: NativeStackState =
      depth === 0 ? 'active' : depth === 1 ? 'paused' : 'detached'

    const resolved = resolveStackState(
      entry,
      {
        pathname: entry.pathname,
        params: entry.params,
        search: entry.search,
        depth,
        isTop: depth === 0,
        navigationType,
      },
      fallbackState,
    )

    return {
      ...entry,
      resolvedStackState: resolved,
    }
  })

  next[lastIndex] = {
    ...next[lastIndex]!,
    resolvedStackState: 'active',
  }

  return next
}

function cloneRouterState(state: RouterState<AnyRoute>): RouterState<AnyRoute> {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(state)
    }
  } catch {
    // Fallback below
  }

  return {
    ...state,
    location: { ...state.location },
    resolvedLocation: state.resolvedLocation
      ? { ...state.resolvedLocation }
      : undefined,
    matches: state.matches.map((match) => ({ ...match })),
    pendingMatches: state.pendingMatches?.map((match) => ({ ...match })),
    cachedMatches: state.cachedMatches.map((match) => ({ ...match })),
  }
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
  const Activity = (React as any).Activity as
    | React.ComponentType<{
        mode?: 'visible' | 'hidden'
        children?: React.ReactNode
      }>
    | undefined

  // Lazily get screen components
  const { Screen, ScreenStack, ScreenStackHeaderConfig } = getScreenComponents()

  const isPendingNavigation = useRouterState({
    select: (s) => s.status === 'pending' && s.isLoading,
  })

  // Get current pathname and animation options from deepest screen match
  const currentScreen = useRouterState({
    select: (s): ScreenEntry => {
      const historyIndex = s.location.state.__TSR_index
      const locationKey =
        s.location.state.__TSR_key ?? s.location.state.key ?? s.location.href

      const renderMatches =
        s.status === 'pending' && s.pendingMatches?.length
          ? s.pendingMatches
          : s.matches

      const renderState =
        renderMatches === s.matches ? s : { ...s, matches: renderMatches }

      const matches = renderMatches
      // Find the deepest match that is a screen (not a layout/navigator)
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]!
        if (match.routeId === rootRouteId) continue
        const route = router.routesById[match.routeId] as AnyRoute
        const native = (route.options as any)?.native as
          | NativeRouteOptions
          | undefined
        if (native?.presentation === 'none') continue

        return {
          pathname: s.location.pathname,
          locationKey,
          historyIndex,
          params: (match as any).params ?? {},
          search: (match as any).search,
          state: cloneRouterState(renderState),
          revision: s.loadedAt,
          stackState: native?.stackState,
          resolvedStackState: 'active',
          presentation: native?.presentation,
          gestureEnabled: native?.gestureEnabled,
          animation: native?.animation,
        }
      }

      return {
        pathname: s.location.pathname,
        locationKey,
        historyIndex,
        params: {},
        search: undefined,
        state: cloneRouterState(renderState),
        revision: s.loadedAt,
        stackState: undefined,
        resolvedStackState: 'active',
        presentation: undefined,
        gestureEnabled: undefined,
        animation: undefined,
      }
    },
  })

  // Track screen stack for proper animation direction
  const [screenStack, setScreenStack] = React.useState<Array<ScreenEntry>>(() =>
    applyStackStates([currentScreen], 'none'),
  )

  // Update stack when navigation happens
  React.useEffect(() => {
    setScreenStack((prev) => {
      const top = prev[prev.length - 1]

      if (!top) {
        return applyStackStates([currentScreen], 'none')
      }

      const nextIndex = currentScreen.historyIndex
      const topIndex = top.historyIndex

      if (nextIndex > topIndex) {
        return applyStackStates([...prev, currentScreen], 'push')
      }

      if (nextIndex < topIndex) {
        const existingIndex = prev.findIndex(
          (s) => s.historyIndex === nextIndex,
        )

        if (existingIndex === -1) {
          return applyStackStates([currentScreen], 'pop')
        }

        const trimmed = prev.slice(0, existingIndex + 1)
        trimmed[trimmed.length - 1] = {
          ...currentScreen,
          resolvedStackState: trimmed[trimmed.length - 1]!.resolvedStackState,
        }

        return applyStackStates(trimmed, 'pop')
      }

      const isReplace = top.locationKey !== currentScreen.locationKey

      if (isReplace) {
        const next = prev.slice()
        next[next.length - 1] = {
          ...currentScreen,
          resolvedStackState: top.resolvedStackState,
        }
        return applyStackStates(next, 'replace')
      }

      if (
        top.revision !== currentScreen.revision ||
        top.animation !== currentScreen.animation ||
        top.presentation !== currentScreen.presentation ||
        top.gestureEnabled !== currentScreen.gestureEnabled
      ) {
        const next = prev.slice()
        next[next.length - 1] = {
          ...currentScreen,
          resolvedStackState: top.resolvedStackState,
        }
        return next
      }

      return prev
    })
  }, [
    currentScreen.locationKey,
    currentScreen.historyIndex,
    currentScreen.revision,
    currentScreen.animation,
    currentScreen.presentation,
    currentScreen.gestureEnabled,
  ])

  const rootRoute: AnyRoute = router.routesById[rootRouteId]
  const PendingComponent =
    rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent
  const pendingElement = PendingComponent ? <PendingComponent /> : null

  // If react-native-screens is not available, fall back to View-based rendering
  if (!ScreenStack || !Screen) {
    return <Matches />
  }

  const renderStack = screenStack.filter((entry) => {
    if (entry.resolvedStackState === 'detached') {
      return false
    }
    return true
  })

  const visibleStack = renderStack.length
    ? renderStack
    : [screenStack[screenStack.length - 1]!]

  return (
    <>
      <Transitioner />
      <ScreenStack style={styles.container}>
        {visibleStack.map((screen, index) => {
          const isTop = index === visibleStack.length - 1
          const stackAnimation = getStackAnimation(screen.animation)

          return (
            <Screen
              key={`${screen.historyIndex}:${screen.locationKey}`}
              style={styles.screen}
              stackPresentation={screen.presentation ?? 'push'}
              stackAnimation={stackAnimation}
              gestureEnabled={getGestureEnabled(screen)}
              freezeOnBlur
              onDismissed={() => {
                if (!isTop) {
                  return
                }
                if (router.history.canGoBack()) {
                  router.history.back()
                }
              }}
            >
              <ScreenStackHeaderConfig hidden />
              <React.Suspense fallback={pendingElement}>
                <routerStateContext.Provider
                  value={
                    isTop && !isPendingNavigation ? undefined : screen.state
                  }
                >
                  {screen.resolvedStackState === 'paused' && Activity ? (
                    <Activity mode="hidden">
                      <MatchesImpl includeTransitioner={false} />
                    </Activity>
                  ) : (
                    <MatchesImpl includeTransitioner={false} />
                  )}
                </routerStateContext.Provider>
              </React.Suspense>
            </Screen>
          )
        })}
      </ScreenStack>
    </>
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
        ...StyleSheet.absoluteFillObject,
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
