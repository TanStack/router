import { createMiddleware } from '@tanstack/start'

export const logMiddleware = createMiddleware()
  .client(async (ctx) => {
    const requestedAt = new Date()

    const res = await ctx.next()

    console.log('Client Req/Res:', {
      ...res,
      context: {
        duration: new Date().getTime() - requestedAt.getTime(),
      },
    })

    return res
  })
  .server(async (ctx) => {
    const requestedAt = new Date()

    const res = await ctx.next()

    console.log('Server Req/Res:', {
      ...res,
      context: {
        duration: new Date().getTime() - requestedAt.getTime(),
      },
    })

    return res
  })
