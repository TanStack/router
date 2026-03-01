import type { router } from './main'

declare module '@tanstack/angular-router-experimental' {
  interface Register {
    router: typeof router
  }
}

export {}
