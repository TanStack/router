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
      prefixes: ['tsrgo://'],
      initialMode: 'push',
      parseUrl: (url) => {
        if (!url) return null
        if (url.startsWith('tsrgo://')) {
          return `/${url.replace('tsrgo://', '').replace(/^\/+/, '')}`
        }
        try {
          const parsed = new URL(url)
          if (parsed.protocol === 'exp:') {
            const path = parsed.pathname.replace(/^\/--/, '') || '/'
            return `${path}${parsed.search}${parsed.hash}`
          }
          return null
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
