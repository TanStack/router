import { createMiddleware } from '@tanstack/start'

export const randomMiddleware = createMiddleware()
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
