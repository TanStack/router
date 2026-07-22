import { createRouter as createWebRouter } from '@tanstack/react-router'
import {
  NativeScriptRouterProvider,
  createNativeScriptRouter,
  createRootRoute,
  startNativeScriptApp,
} from '../src'
import type { AnyNativeScriptRouter } from '../src'

declare module '@tanstack/react-router/native' {
  interface NativeRouteOptionsExtensions {
    presentation?: 'push' | 'modal'
  }
}

const routeTree = createRootRoute({
  native: (context) => ({
    title: context.pathname,
    headerShown: ({ canGoBack }) => canGoBack,
    headerStyle: {
      backgroundColor: 'white',
      color: 'black',
      flat: true,
    },
    animated: true,
    transition: { name: 'slideLeft' },
    presentation: 'push',
  }),
})

const router = createNativeScriptRouter({
  routeTree,
  initialPath: '/account',
})

const anyNativeRouter: AnyNativeScriptRouter = router
void anyNativeRouter.back()
NativeScriptRouterProvider({ router })
void startNativeScriptApp({ router })

const sharedRouter = createWebRouter({ routeTree })
NativeScriptRouterProvider({ router: sharedRouter })
void startNativeScriptApp({ router: sharedRouter })

// @ts-expect-error A web Router is accepted at the aliased app boundary, but is not itself a NativeScriptRouter.
const invalidNativeRouter: AnyNativeScriptRouter = sharedRouter
void invalidNativeRouter

createNativeScriptRouter({
  routeTree,
  // @ts-expect-error Native pages cannot be synthesized for seeded entries.
  initialEntries: ['/', '/account'],
})
