import { createMiddleware, createStart } from '@tanstack/react-start'

const globalMiddleware = createMiddleware().server(
  async ({ next, context }) => {
    console.debug('[server-entry]: global middleware', context)
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [globalMiddleware],
}))
