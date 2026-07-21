import { createNativeScriptRouter, createRootRoute } from '../src'

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

createNativeScriptRouter({
  routeTree,
  initialPath: '/account',
})

createNativeScriptRouter({
  routeTree,
  // @ts-expect-error Native pages cannot be synthesized for seeded entries.
  initialEntries: ['/', '/account'],
})
