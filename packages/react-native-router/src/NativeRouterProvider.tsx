import * as React from 'react'
import { View, StyleSheet, BackHandler, Platform } from 'react-native'
import { getRouterContext } from './routerContext'
import { Matches, NativeScreenMatches } from './Matches'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

// Optional: Import GestureHandlerRootView if available
let GestureHandlerRootView: any

try {
  const gestureHandler = require('react-native-gesture-handler')
  GestureHandlerRootView = gestureHandler.GestureHandlerRootView
} catch {
  // react-native-gesture-handler not installed
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
          router.history.back()
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

  const content = (
    <RouterContextProvider router={router} context={context}>
      {children ?? (useNativeScreens ? <NativeScreenMatches /> : <Matches />)}
    </RouterContextProvider>
  )

  // Wrap in GestureHandlerRootView if available
  if (GestureHandlerRootView) {
    return (
      <GestureHandlerRootView style={styles.container}>
        {content}
      </GestureHandlerRootView>
    )
  }

  return <View style={styles.container}>{content}</View>
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
