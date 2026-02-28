import type { router } from './main'

declare module '@tanstack/angular-router' {
  interface Register {
    router: typeof router
  }
}

export {}
