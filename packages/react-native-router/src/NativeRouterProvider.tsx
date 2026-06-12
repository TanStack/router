import * as React from 'react'
import { BackHandler, Linking, Platform, View } from 'react-native'
import { Matches, NativeScreenMatches } from './Matches'
import { parseExternalUrl } from './linking'
import { resolveNativeNavigateOptions } from './nativeNavigation'
import { getRouterContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'
import type { NativeLinkingMode, NativeLinkingOptions } from './linking'

// Lazily load GestureHandlerRootView to avoid accessing native modules at module load time
let _GestureHandlerRootView: any = null
let _gestureHandlerChecked = false

function getGestureHandlerRootView() {
  if (!_gestureHandlerChecked) {
    _gestureHandlerChecked = true
    try {
      // Probe for the native TurboModule first. `getEnforcing` throws (and
      // logs to LogBox in dev) when the native side isn't registered, but
      // `get()` returns null. This matters in environments where the JS
      // version of gesture-handler is installed but the native binary
      // doesn't expose a matching module (e.g., Expo Go bundled with a
      // different gesture-handler build than the one resolved in JS).
      const RN = require('react-native') as {
        TurboModuleRegistry?: { get?: (name: string) => unknown }
      }
      if (!RN.TurboModuleRegistry?.get?.('RNGestureHandlerModule')) {
        return null
      }

      const gestureHandler = require('react-native-gesture-handler')
      _GestureHandlerRootView = gestureHandler.GestureHandlerRootView
    } catch {
      // gesture-handler not installed
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

function defaultLinkingSubscribe(listener: (url: string) => void) {
  const sub = Linking.addEventListener('url', ({ url }) => {
    listener(url)
  })

  return () => sub.remove()
}

function resolveLinkingOptions(
  linking: boolean | NativeLinkingOptions | undefined,
): Required<
  Pick<
    NativeLinkingOptions,
    'enabled' | 'initialMode' | 'initialAnimate' | 'incomingMode'
  >
> &
  Omit<
    NativeLinkingOptions,
    'enabled' | 'initialMode' | 'initialAnimate' | 'incomingMode'
  > {
  if (linking === false) {
    return {
      enabled: false,
      initialMode: 'push',
      initialAnimate: false,
      incomingMode: 'push',
      prefixes: [],
    }
  }

  const options = linking === true || linking == null ? {} : linking

  return {
    enabled: options.enabled ?? true,
    prefixes: options.prefixes ?? [],
    filter: options.filter,
    parseUrl: options.parseUrl,
    getInitialURL: options.getInitialURL ?? (() => Linking.getInitialURL()),
    subscribe: options.subscribe ?? defaultLinkingSubscribe,
    initialMode: options.initialMode ?? 'push',
    initialAnimate: options.initialAnimate ?? false,
    incomingMode: options.incomingMode ?? 'push',
    onUnhandledUrl: options.onUnhandledUrl,
    onError: options.onError,
  }
}

function useNativeLinking(router: AnyRouter) {
  const linking = (router.options as any).native?.linking as
    | boolean
    | NativeLinkingOptions
    | undefined
  const linkingOptions = React.useMemo(
    () => resolveLinkingOptions(linking),
    [linking],
  )

  const navigateToExternalUrl = React.useCallback(
    (url: string, mode: NativeLinkingMode, isInitial = false) => {
      if (!linkingOptions.enabled) {
        return
      }

      try {
        if (linkingOptions.filter && !linkingOptions.filter(url)) {
          linkingOptions.onUnhandledUrl?.(url)
          return
        }

        const parsedHref =
          linkingOptions.parseUrl?.(url) ??
          parseExternalUrl(url, linkingOptions.prefixes ?? [])

        if (!parsedHref) {
          linkingOptions.onUnhandledUrl?.(url)
          return
        }

        if (router.history.location.href === parsedHref) {
          return
        }

        const navigateOptions = resolveNativeNavigateOptions(
          router as any,
          {
            to: parsedHref,
            replace: mode === 'replace',
            state:
              isInitial && mode === 'push' && !linkingOptions.initialAnimate
                ? (prev: Record<string, unknown> | undefined) => ({
                    ...(prev ?? {}),
                    __TSR_initialDeepLink: true,
                  })
                : undefined,
          } as any,
        )

        router.navigate(navigateOptions as any)
      } catch (error) {
        linkingOptions.onError?.(error, url)
      }
    },
    [router, linkingOptions],
  )

  React.useEffect(() => {
    if (!linkingOptions.enabled) return

    let isMounted = true
    let unsubscribe: (() => void) | undefined

    const run = async () => {
      try {
        const initialUrl = await linkingOptions.getInitialURL?.()
        if (isMounted && initialUrl) {
          navigateToExternalUrl(initialUrl, linkingOptions.initialMode, true)
        }
      } catch (error) {
        linkingOptions.onError?.(error)
      }

      if (!isMounted) return

      unsubscribe = linkingOptions.subscribe?.((url) => {
        navigateToExternalUrl(url, linkingOptions.incomingMode)
      })
    }

    run()

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [linkingOptions, navigateToExternalUrl])
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
  useNativeLinking(router)

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
