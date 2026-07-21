import * as React from 'react'
import { Application, isAndroid } from '@nativescript/core'
import {
  RouteLinkProvider,
  RouterContextProviderBase,
  RouterRendererProvider,
  Transitioner,
  useRouterState,
} from '@tanstack/react-router/native'
import { NativeStackController } from './native-stack-controller'
import { createNativeScreenSnapshot } from './screen'
import { setupNativeScriptLinking } from './linking'
import { Link } from './Link'
import { nativeScriptRouterRenderer } from './fallbacks'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterProps,
} from '@tanstack/react-router/native'
import type {
  NativeScriptFrameLike,
  NativeStackControllerOptions,
} from './native-stack-controller'
import type { NativeScriptActionBarProps } from './page'
import type { NativeScriptLinkingOptions } from './linking'
import type { AndroidActivityBackPressedEventData } from '@nativescript/core'

export interface NativeScriptRouterProviderProps<
  TRouter extends AnyRouter = RegisteredRouter,
> extends NativeStackControllerOptions {
  router: TRouter
  context?: RouterProps<TRouter>['context']
  actionBarVisibility?: 'auto' | 'never' | 'always'
  linking?: false | NativeScriptLinkingOptions
  children?: React.ReactNode
  actionBar?: (props: NativeScriptActionBarProps) => React.ReactNode | undefined
}

function useNativeScriptLinking(
  router: AnyRouter,
  linking: false | NativeScriptLinkingOptions | undefined,
) {
  React.useEffect(() => {
    if (linking === false || !linking) {
      return
    }

    return setupNativeScriptLinking(router, linking)
  }, [linking, router])
}

function useAndroidBackHandler(router: AnyRouter) {
  React.useEffect(() => {
    if (!isAndroid) {
      return
    }

    const handler = (event: AndroidActivityBackPressedEventData) => {
      if (!router.history.canGoBack()) {
        return
      }

      event.cancel = true
      void router.back()
    }

    Application.android.on(
      Application.android.activityBackPressedEvent,
      handler,
    )
    return () => {
      Application.android.off(
        Application.android.activityBackPressedEvent,
        handler,
      )
    }
  }, [router])
}

function NativeFrameHost({
  router,
  actionBarVisibility,
  controllerOptions,
}: {
  router: AnyRouter
  actionBarVisibility: 'auto' | 'never' | 'always'
  controllerOptions: NativeStackControllerOptions
}) {
  const state = useRouterState()
  const [frame, setFrame] = React.useState<NativeScriptFrameLike>()
  const controllerRef = React.useRef<NativeStackController | undefined>(
    undefined,
  )

  React.useLayoutEffect(() => {
    if (!frame) {
      return
    }

    const controller = new NativeStackController(frame, router, {})
    controllerRef.current = controller
    return () => {
      controller.dispose()
      if (controllerRef.current === controller) {
        controllerRef.current = undefined
      }
    }
  }, [frame, router])

  React.useLayoutEffect(() => {
    controllerRef.current?.setOptions(controllerOptions)
  }, [controllerOptions])

  React.useLayoutEffect(() => {
    if (
      !controllerRef.current ||
      !state.matches.length ||
      state.status !== 'idle'
    ) {
      return
    }

    controllerRef.current.sync(createNativeScreenSnapshot(router, state))
  }, [router, state])

  return React.createElement('frame', {
    ref: setFrame,
    actionBarVisibility,
  })
}

/**
 * Render TanStack Router through a NativeScript Frame and native Page stack.
 */
export function NativeScriptRouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
>({
  router,
  context,
  actionBarVisibility = 'auto',
  linking,
  children,
  actionBar,
  defaultActionBar,
  actionBarBackgroundColor,
  actionBarColor,
  onNavigationError,
  animated,
  transition,
}: NativeScriptRouterProviderProps<TRouter>) {
  const resolvedLinking =
    linking === undefined
      ? ((
          router.options as {
            native?: { linking?: false | NativeScriptLinkingOptions }
          }
        ).native?.linking ?? false)
      : linking

  useNativeScriptLinking(router, resolvedLinking)
  useAndroidBackHandler(router)

  const controllerOptions = React.useMemo<NativeStackControllerOptions>(
    () => ({
      actionBar,
      defaultActionBar,
      actionBarBackgroundColor,
      actionBarColor,
      onNavigationError,
      animated,
      transition,
    }),
    [
      actionBar,
      actionBarBackgroundColor,
      actionBarColor,
      defaultActionBar,
      onNavigationError,
      animated,
      transition,
    ],
  )

  return (
    <RouterRendererProvider renderer={nativeScriptRouterRenderer}>
      <RouteLinkProvider component={Link}>
        <RouterContextProviderBase router={router} context={context}>
          <Transitioner />
          <NativeFrameHost
            router={router}
            actionBarVisibility={actionBarVisibility}
            controllerOptions={controllerOptions}
          />
          {children}
        </RouterContextProviderBase>
      </RouteLinkProvider>
    </RouterRendererProvider>
  )
}
