import { createGlobalMiddleware } from '@tanstack/start'

export const randomMiddleware = createGlobalMiddleware()
  .client((ctx) => {
    return ctx.next({
      context: {
        clientRandom: Math.random(),
      },
    })
  })
  .server((ctx) => {
    return ctx.next({
      context: {
        serverRandom: Math.random(),
      },
    })
  })
