// Import from /core subpath to avoid loading React Native components at module load time
import {
  createRouter,
  createNativeHistory,
} from '@tanstack/react-native-router/core'
import { routeTree } from './routeTree.gen'

// Create the router with native history
export const router = createRouter({
  routeTree,
  history: createNativeHistory(),
  defaultPreload: 'intent',
  native: {
    linking: {
      prefixes: [
        'tanstackrouter://',
        'https://tanstack-router-rn-example.local',
      ],
      initialMode: 'push',
      parseUrl: (url) => {
        if (!url) return null

        if (url.startsWith('tanstackrouter://')) {
          return `/${url.replace('tanstackrouter://', '').replace(/^\/+/, '')}`
        }

        try {
          const parsed = new URL(url)

          if (parsed.protocol === 'exp:') {
            const path = parsed.pathname.replace(/^\/--/, '') || '/'
            return `${path}${parsed.search}${parsed.hash}`
          }

          if (parsed.protocol === 'https:') {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`
          }
        } catch {
          return null
        }

        return null
      },
    },
  },
})

// Register the router for type safety
declare module '@tanstack/react-native-router' {
  interface Register {
    router: typeof router
  }
}
