import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'

hydrateStart().then((router) => {
  const app = createSSRApp(StartClient, { router })

  // Suppress expected hydration mismatch warnings for routes with ssr: 'data-only' or ssr: false
  // These routes intentionally render different content on server (nothing/placeholder) vs client
  // Vue logs hydration mismatches to both console.warn (detailed) and console.error (summary)
  const originalWarn = console.warn
  const originalError = console.error

  const isHydrationMismatchMessage = (msg: unknown): boolean => {
    if (typeof msg !== 'string') return false
    return (
      msg.includes('Hydration completed but contains mismatches') ||
      msg.includes('Hydration node mismatch')
    )
  }

  console.warn = (...args) => {
    if (isHydrationMismatchMessage(args[0])) {
      return
    }
    originalWarn.apply(console, args)
  }

  console.error = (...args) => {
    if (isHydrationMismatchMessage(args[0])) {
      return
    }
    originalError.apply(console, args)
  }

  // Mount to #__app wrapper div for proper Vue hydration
  // The Body component creates this wrapper on the server
  app.mount('#__app')
})
