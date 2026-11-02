import { createMiddleware, createStart } from '@tanstack/react-start'

// Provides the request context every feature module requires.
const viewer = createMiddleware().server(({ next }) =>
  next({ context: { viewer: 'ada' } }),
)

export const startInstance = createStart(() => ({
  requestMiddleware: [viewer],
}))
