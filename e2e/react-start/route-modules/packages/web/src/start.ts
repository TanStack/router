import { createMiddleware, createStart } from '@tanstack/react-start'
import { startModules } from './startModules.gen'

// Provides the request context the catalog requires.
const shopper = createMiddleware().server(({ next }) =>
  next({ context: { shopper: 'ada' } }),
)

export const startInstance = createStart(() => ({
  extends: startModules,
  requestMiddleware: [shopper],
}))
