import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { rootRouteId } from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Match } from './Match'
import { matchContext } from './matchContext'
import { routerStateContext } from './routerStateContext'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { Transitioner } from './Transitioner'
import { resolveNativeRouteOptions } from './resolveNativeRouteOptions'
import type { AnyRoute, RouterState } from '@tanstack/router-core'
import type {
  NativeHeaderContext,
  NativeHeaderVisibilityOption,
  NativeMinStackState,
  NativeRouteOptions,
  NativeRouteOptionsInput,
  NativeStackState,
} from './route'
import type { NativeRouterOptions } from './router'

// Lazily load react-native-screens to avoid accessing native modules at module load time
let _Screen: any = null
let _ScreenStack: any = null
let _ScreenStackHeaderConfig: any = null
let _ScreenStackHeaderLeftView: any = null
let _ScreenStackHeaderRightView: any = null
let _ScreenStackHeaderCenterView: any = null
let _screensChecked = false
let _screensEnabled = false
let _View: any = null

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
      _ScreenStackHeaderLeftView = screens.ScreenStackHeaderLeftView
      _ScreenStackHeaderRightView = screens.ScreenStackHeaderRightView
      _ScreenStackHeaderCenterView = screens.ScreenStackHeaderCenterView
    } catch {
      // react-native-screens not installed, will use View-based rendering
    }

    if (!_View) {
      try {
        _View = require('react-native').View
      } catch {
        // ignore
      }
    }
  }
  return {
    Screen: _Screen,
    ScreenStack: _ScreenStack,
    ScreenStackHeaderConfig: _ScreenStackHeaderConfig,
    ScreenStackHeaderLeftView: _ScreenStackHeaderLeftView,
    ScreenStackHeaderRightView: _ScreenStackHeaderRightView,
    ScreenStackHeaderCenterView: _ScreenStackHeaderCenterView,
    View: _View,
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

function resolveVisibilityOption(
  option: NativeHeaderVisibilityOption | undefined,
  ctx: NativeHeaderContext,
  fallback: boolean,
): boolean {
  if (typeof option === 'function') {
    return option(ctx)
  }

  if (typeof option === 'boolean') {
    return option
  }

  return fallback
}

function resolveTitle(
  title: NativeRouteOptions['title'],
  ctx: NativeHeaderContext,
): string | undefined {
  if (typeof title === 'function') {
    return title(ctx)
  }

  return title
}

function getDefaultTitle(pathname: string): string {
  if (pathname === '/') {
    return 'Home'
  }

  const parts = pathname.split('/').filter(Boolean)
  const segment = parts[parts.length - 1]
  if (!segment) {
    return 'Screen'
  }

  const decoded = decodeURIComponent(segment)
  return decoded.replace(/[-_]/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase())
}

interface ScreenEntry {
  pathname: string
  routeId: string
  locationKey: string
  historyIndex: number
  params: Record<string, string>
  search: unknown
  loaderData: unknown
  context: unknown
  state: RouterState<AnyRoute>
  revision: number
  native: NativeRouteOptions | undefined
  entryMinStackState?: NativeMinStackState
  resolvedStackState: NativeStackState
  presentation?: NativeRouteOptions['presentation']
  gestureEnabled?: boolean
  animation?: NativeRouteOptions['animation']
}

function mergeNativeOptions(
  previous: NativeRouteOptions | undefined,
  next: NativeRouteOptions,
): NativeRouteOptions {
  return {
    ...previous,
    ...next,
    headerStyle:
      previous?.headerStyle || next.headerStyle
        ? {
            ...(previous?.headerStyle ?? {}),
            ...(next.headerStyle ?? {}),
          }
        : undefined,
  }
}

function resolveNativeForMatchedIndex(
  router: ReturnType<typeof useRouter>,
  matches: Array<any>,
  targetIndex: number,
  pathname: string,
  historyIndex: number,
): {
  native: NativeRouteOptions | undefined
  leafMinStackState: NativeMinStackState | undefined
} {
  let mergedNative: NativeRouteOptions | undefined
  let leafMinStackState: NativeMinStackState | undefined

  for (let i = 0; i <= targetIndex; i++) {
    const match = matches[i]!
    const route = router.routesById[match.routeId] as AnyRoute | undefined
    const nativeInput = (route?.options as any)?.native as
      | NativeRouteOptionsInput
      | undefined

    const resolved = resolveNativeRouteOptions(nativeInput, {
      pathname,
      params: match.params ?? {},
      search: match.search,
      loaderData: match.loaderData,
      context: match.context,
      canGoBack: historyIndex > 0,
    })

    if (!resolved) {
      continue
    }

    if (i === targetIndex) {
      leafMinStackState = resolved.minStackState
      mergedNative = mergeNativeOptions(mergedNative, resolved)
      continue
    }

    const { minStackState: _minStackState, ...inheritedNative } = resolved
    mergedNative = mergeNativeOptions(mergedNative, inheritedNative)
  }

  return {
    native: mergedNative,
    leafMinStackState,
  }
}

export interface NativeStackDebugEntry {
  pathname: string
  routeId: string
  historyIndex: number
  locationKey: string
  entryMinStackState?: NativeMinStackState
  resolvedStackState: NativeStackState
}

let nativeStackDebugSnapshot: Array<NativeStackDebugEntry> = []
const nativeStackDebugListeners = new Set<() => void>()

function setNativeStackDebugSnapshot(stack: Array<ScreenEntry>) {
  nativeStackDebugSnapshot = stack.map((entry) => ({
    pathname: entry.pathname,
    routeId: entry.routeId,
    historyIndex: entry.historyIndex,
    locationKey: entry.locationKey,
    entryMinStackState: entry.entryMinStackState,
    resolvedStackState: entry.resolvedStackState,
  }))

  nativeStackDebugListeners.forEach((listener) => listener())
}

export function getNativeStackDebugSnapshot(): Array<NativeStackDebugEntry> {
  return nativeStackDebugSnapshot
}

export function subscribeNativeStackDebug(listener: () => void): () => void {
  nativeStackDebugListeners.add(listener)
  return () => {
    nativeStackDebugListeners.delete(listener)
  }
}

export function useNativeStackDebugSnapshot(): Array<NativeStackDebugEntry> {
  return React.useSyncExternalStore(
    subscribeNativeStackDebug,
    getNativeStackDebugSnapshot,
    getNativeStackDebugSnapshot,
  )
}

const DEFAULT_PAUSED_DEPTH = 3

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  if (value < 0) {
    return undefined
  }

  return Math.floor(value)
}

function getDepthPolicy(nativeOptions: NativeRouterOptions | undefined) {
  const pausedDepth =
    toNonNegativeInt(nativeOptions?.pausedDepth) ?? DEFAULT_PAUSED_DEPTH
  const detachedDepth =
    toNonNegativeInt(nativeOptions?.detachedDepth) ?? pausedDepth + 1

  return {
    pausedDepth,
    detachedDepth: Math.max(detachedDepth, pausedDepth + 1),
  }
}

function clampByMinStackState(
  state: NativeStackState,
  minStackState: NativeMinStackState | undefined,
): NativeStackState {
  if (!minStackState) {
    return state
  }

  if (minStackState === 'active') {
    return 'active'
  }

  if (state === 'detached') {
    return 'paused'
  }

  return state
}

function resolveRouteMinStackState(
  entry: ScreenEntry,
  routerNative: NativeRouterOptions | undefined,
): NativeMinStackState | undefined {
  if (entry.entryMinStackState) {
    return entry.entryMinStackState
  }

  return (
    entry.native?.minStackState ??
    entry.native?.defaultMinStackState ??
    routerNative?.defaultMinStackState
  )
}

function applyStackStates(
  stack: Array<ScreenEntry>,
  navigationType: 'push' | 'pop' | 'replace' | 'none',
  router: ReturnType<typeof useRouter>,
): Array<ScreenEntry> {
  if (!stack.length) return stack

  const routerNative = (router.options as any).native as
    | NativeRouterOptions
    | undefined
  const depthPolicy = getDepthPolicy(routerNative)

  const lastIndex = stack.length - 1
  const next = stack.map((entry, index) => {
    const depth = lastIndex - index
    const fallbackState: NativeStackState =
      depth === 0
        ? 'active'
        : depth >= depthPolicy.detachedDepth
          ? 'detached'
          : depth <= depthPolicy.pausedDepth
            ? 'paused'
            : 'paused'

    const minStackState = resolveRouteMinStackState(entry, routerNative)
    const resolved = clampByMinStackState(fallbackState, minStackState)

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
  const {
    Screen,
    ScreenStack,
    ScreenStackHeaderConfig,
    ScreenStackHeaderLeftView,
    ScreenStackHeaderRightView,
    ScreenStackHeaderCenterView,
    View,
  } = getScreenComponents()

  const isPendingNavigation = useRouterState({
    select: (s) => s.status === 'pending' && s.isLoading,
  })

  // pendingMatches is no longer on RouterState (signal-based core refactor) —
  // subscribe to its dedicated store. Only matters when navigation is pending
  // and there's a non-trivial match list to render mid-transition.
  const pendingMatches = useStore(
    router.stores.pendingMatches,
    (m) => m,
  ) as Array<any>
  const usePendingMatches = isPendingNavigation && pendingMatches.length > 1

  // Get current pathname and animation options from deepest screen match
  const currentScreen = useRouterState({
    select: (s): ScreenEntry => {
      const historyIndex = s.location.state.__TSR_index
      const locationKey =
        s.location.state.__TSR_key ?? s.location.state.key ?? s.location.href
      const isInitialDeepLink = Boolean(
        (s.location.state as any).__TSR_initialDeepLink,
      )

      const matches = usePendingMatches ? pendingMatches : s.matches

      const renderState = usePendingMatches ? { ...s, matches } : s
      // Find the deepest match that is a screen (not a layout/navigator)
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]!
        if (match.routeId === rootRouteId) continue
        const { native, leafMinStackState } = resolveNativeForMatchedIndex(
          router,
          matches,
          i,
          s.location.pathname,
          historyIndex,
        )
        if (native?.presentation === 'none') continue

        return {
          pathname: s.location.pathname,
          routeId: match.routeId,
          locationKey,
          historyIndex,
          params: match.params ?? {},
          search: match.search,
          loaderData: match.loaderData,
          context: match.context,
          state: cloneRouterState(renderState),
          revision: s.loadedAt,
          native,
          entryMinStackState:
            (s.location.state as any).__TSR_nativeMinStackState ??
            leafMinStackState,
          resolvedStackState: 'active',
          presentation: native?.presentation,
          gestureEnabled: native?.gestureEnabled,
          animation: isInitialDeepLink ? 'none' : native?.animation,
        }
      }

      return {
        pathname: s.location.pathname,
        routeId: rootRouteId,
        locationKey,
        historyIndex,
        params: {},
        search: undefined,
        loaderData: undefined,
        context: undefined,
        state: cloneRouterState(renderState),
        revision: s.loadedAt,
        native: undefined,
        entryMinStackState: (s.location.state as any).__TSR_nativeMinStackState,
        resolvedStackState: 'active',
        presentation: undefined,
        gestureEnabled: undefined,
        animation: undefined,
      }
    },
  })

  // Track screen stack for proper animation direction
  const [screenStack, setScreenStack] = React.useState<Array<ScreenEntry>>(() =>
    applyStackStates([currentScreen], 'none', router),
  )

  // Update stack when navigation happens
  React.useEffect(() => {
    setScreenStack((prev) => {
      const top = prev[prev.length - 1]

      if (!top) {
        return applyStackStates([currentScreen], 'none', router)
      }

      const nextIndex = currentScreen.historyIndex
      const topIndex = top.historyIndex

      if (nextIndex > topIndex) {
        return applyStackStates([...prev, currentScreen], 'push', router)
      }

      if (nextIndex < topIndex) {
        const existingIndex = prev.findIndex(
          (s) => s.historyIndex === nextIndex,
        )

        if (existingIndex === -1) {
          return applyStackStates([currentScreen], 'pop', router)
        }

        const trimmed = prev.slice(0, existingIndex + 1)
        trimmed[trimmed.length - 1] = {
          ...currentScreen,
          resolvedStackState: trimmed[trimmed.length - 1]!.resolvedStackState,
        }

        return applyStackStates(trimmed, 'pop', router)
      }

      const isReplace = top.locationKey !== currentScreen.locationKey

      if (isReplace) {
        const next = prev.slice()
        next[next.length - 1] = {
          ...currentScreen,
          resolvedStackState: top.resolvedStackState,
        }
        return applyStackStates(next, 'replace', router)
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
    currentScreen.entryMinStackState,
    router,
  ])

  React.useEffect(() => {
    if (!ScreenStack || !Screen) {
      setNativeStackDebugSnapshot([currentScreen])
      return
    }

    setNativeStackDebugSnapshot(screenStack)
  }, [Screen, ScreenStack, currentScreen, screenStack])

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
          const native = screen.native

          const headerContext: NativeHeaderContext = {
            pathname: screen.pathname,
            params: screen.params,
            search: screen.search,
            loaderData: screen.loaderData,
            context: screen.context,
            canGoBack: screen.historyIndex > 0,
          }

          const defaultHeaderShown =
            screen.presentation === 'none' ? false : true
          const headerShown = resolveVisibilityOption(
            native?.headerShown,
            headerContext,
            defaultHeaderShown,
          )

          const headerTintColor = native?.headerTintColor
          const headerRenderContext = {
            ...headerContext,
            tintColor: headerTintColor,
          }

          const headerLeftNode = native?.headerLeft?.(headerRenderContext)
          const headerRightNode = native?.headerRight?.(headerRenderContext)
          const customHeader = native?.header
          const hasCustomHeader = typeof customHeader === 'function'

          const showBackButton = resolveVisibilityOption(
            native?.headerBackVisible,
            headerContext,
            headerLeftNode ? false : headerContext.canGoBack,
          )

          const headerTitle = native?.headerTitle
          const title = resolveTitle(native?.title, headerContext)
          const titleText =
            typeof headerTitle === 'function'
              ? undefined
              : typeof headerTitle === 'string'
                ? headerTitle
                : (title ?? getDefaultTitle(screen.pathname))

          const headerCenterNode =
            typeof headerTitle === 'function'
              ? headerTitle(headerRenderContext)
              : undefined

          const customHeaderNode = hasCustomHeader
            ? customHeader(headerContext)
            : undefined

          const shouldHideNativeHeader = hasCustomHeader ? true : !headerShown
          const showBackInCustomView = Boolean(headerLeftNode && showBackButton)

          return (
            <Screen
              key={`${screen.historyIndex}:${screen.locationKey}`}
              style={styles.screen}
              stackPresentation={screen.presentation ?? 'push'}
              stackAnimation={stackAnimation}
              gestureEnabled={getGestureEnabled(screen)}
              freezeOnBlur
              sheetAllowedDetents={native?.sheetAllowedDetents}
              sheetInitialDetentIndex={native?.sheetInitialDetentIndex}
              sheetGrabberVisible={native?.sheetGrabberVisible}
              sheetCornerRadius={native?.sheetCornerRadius}
              sheetLargestUndimmedDetentIndex={
                native?.sheetLargestUndimmedDetentIndex
              }
              sheetExpandsWhenScrolledToEdge={
                native?.sheetExpandsWhenScrolledToEdge
              }
              sheetElevation={native?.sheetElevation}
              onSheetDetentChanged={native?.onSheetDetentChanged}
              onDismissed={() => {
                if (!isTop) {
                  return
                }
                if (router.history.canGoBack()) {
                  if ((router as any).back) {
                    ;(router as any).back()
                  } else {
                    router.history.back()
                  }
                }
              }}
            >
              <ScreenStackHeaderConfig
                hidden={shouldHideNativeHeader}
                title={titleText}
                color={headerTintColor}
                titleColor={headerTintColor}
                backgroundColor={native?.headerStyle?.backgroundColor}
                translucent={native?.headerTransparent === true}
                largeTitle={native?.headerLargeTitle === true}
                hideBackButton={!showBackButton}
                backButtonInCustomView={showBackInCustomView}
              >
                {headerLeftNode && ScreenStackHeaderLeftView ? (
                  <ScreenStackHeaderLeftView>
                    {headerLeftNode}
                  </ScreenStackHeaderLeftView>
                ) : null}
                {headerRightNode && ScreenStackHeaderRightView ? (
                  <ScreenStackHeaderRightView>
                    {headerRightNode}
                  </ScreenStackHeaderRightView>
                ) : null}
                {headerCenterNode && ScreenStackHeaderCenterView ? (
                  <ScreenStackHeaderCenterView>
                    {headerCenterNode}
                  </ScreenStackHeaderCenterView>
                ) : null}
              </ScreenStackHeaderConfig>
              <React.Suspense fallback={pendingElement}>
                <routerStateContext.Provider
                  value={
                    isTop &&
                    (!isPendingNavigation || screen.state.matches.length <= 1)
                      ? undefined
                      : screen.state
                  }
                >
                  {screen.resolvedStackState === 'paused' && Activity ? (
                    <Activity mode="hidden">
                      {customHeaderNode && View ? (
                        <View style={styles.customHeaderContainer}>
                          {customHeaderNode}
                          <MatchesImpl includeTransitioner={false} />
                        </View>
                      ) : (
                        <MatchesImpl includeTransitioner={false} />
                      )}
                    </Activity>
                  ) : customHeaderNode && View ? (
                    <View style={styles.customHeaderContainer}>
                      {customHeaderNode}
                      <MatchesImpl includeTransitioner={false} />
                    </View>
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
let _styles: {
  container: object
  screen: object
  customHeaderContainer: object
} | null = null
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
      customHeaderContainer: {
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
  get customHeaderContainer() {
    return getStyles().customHeaderContainer
  },
}
