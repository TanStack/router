import {
  createRouter,
  createNativeHistory,
} from '@tanstack/react-native-router/core'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  history: createNativeHistory(),
  defaultPreload: 'intent',
  native: {
    linking: {
      prefixes: ['tanstackbare://'],
      initialMode: 'push',
      parseUrl: (url) => {
        if (!url) return null
        if (url.startsWith('tanstackbare://')) {
          return `/${url.replace('tanstackbare://', '').replace(/^\/+/, '')}`
        }
        try {
          const parsed = new URL(url)
          return `${parsed.pathname}${parsed.search}${parsed.hash}`
        } catch {
          return null
        }
      },
    },
  },
})

declare module '@tanstack/react-native-router' {
  interface Register {
    router: typeof router
  }
}
