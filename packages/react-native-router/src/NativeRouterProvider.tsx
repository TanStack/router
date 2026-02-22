import * as React from 'react'
import { View, BackHandler, Platform } from 'react-native'
import { getRouterContext } from './routerContext'
import { Matches, NativeScreenMatches } from './Matches'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

// Lazily load GestureHandlerRootView to avoid accessing native modules at module load time
let _GestureHandlerRootView: any = null
let _gestureHandlerChecked = false

function getGestureHandlerRootView() {
  if (!_gestureHandlerChecked) {
    _gestureHandlerChecked = true
    try {
      const gestureHandler = require('react-native-gesture-handler')
      _GestureHandlerRootView = gestureHandler.GestureHandlerRootView
    } catch {
      // react-native-gesture-handler not installed
    }
  }
  return _GestureHandlerRootView
}

export interface NativeRouterProviderProps<
  TRouter extends AnyRouter = RegisteredRouter,
> {
  router: TRouter
  /**
   * Use native screen stack rendering (requires react-native-screens)
   * @default true
   */
  useNativeScreens?: boolean
  /**
   * Additional context to merge into the router context
   */
  context?: Record<string, any>
  /**
   * Children to render (optional, typically not used as Matches is rendered automatically)
   */
  children?: React.ReactNode
}

/**
 * Low-level provider that places the router into React context.
 */
export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
>({
  router,
  children,
  context,
}: {
  router: TRouter
  children: React.ReactNode
  context?: Record<string, any>
}) {
  // Update router context if provided
  if (context) {
    router.update({
      ...router.options,
      context: {
        ...router.options.context,
        ...context,
      },
    } as any)
  }

  const routerContext = getRouterContext()

  const provider = (
    <routerContext.Provider value={router as AnyRouter}>
      {children}
    </routerContext.Provider>
  )

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }

  return provider
}

/**
 * Hook to handle Android back button press
 */
function useAndroidBackHandler(router: AnyRouter) {
  React.useEffect(() => {
    if (Platform.OS !== 'android') return

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (router.history.canGoBack()) {
          if ((router as any).back) {
            ;(router as any).back()
          } else {
            router.history.back()
          }
          return true // Prevent default back behavior
        }
        return false // Allow default back behavior (exit app)
      },
    )

    return () => subscription.remove()
  }, [router])
}

/**
 * Top-level component that renders the active route matches and provides the
 * router to the React Native tree via context.
 *
 * This component:
 * - Wraps everything in GestureHandlerRootView (if available)
 * - Handles Android back button navigation
 * - Uses react-native-screens for native stack navigation (if available and enabled)
 */
export function NativeRouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
>({
  router,
  useNativeScreens = true,
  context,
  children,
}: NativeRouterProviderProps<TRouter>) {
  // Handle Android back button
  useAndroidBackHandler(router)

  // Use NativeScreenMatches for native transitions when enabled
  // Falls back to View-based Matches if react-native-screens is not available
  const MatchesComponent = useNativeScreens ? NativeScreenMatches : Matches

  const content = (
    <RouterContextProvider router={router} context={context}>
      {children ?? <MatchesComponent />}
    </RouterContextProvider>
  )

  // Lazily get GestureHandlerRootView (called during render, not module load)
  const GestureHandlerRootView = getGestureHandlerRootView()

  // Wrap in GestureHandlerRootView if available
  if (GestureHandlerRootView) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        {content}
      </GestureHandlerRootView>
    )
  }

  return <View style={{ flex: 1 }}>{content}</View>
}
