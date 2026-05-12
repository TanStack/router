import { createRouter } from '@tanstack/remix-router'
import { routeTree } from './routeTree'

export function makeRouter() {
  return createRouter({ routeTree })
}

export type AppRouter = ReturnType<typeof makeRouter>
