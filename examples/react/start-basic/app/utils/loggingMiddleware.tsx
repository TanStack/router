import { createMiddleware } from '@tanstack/start'

export const logMiddleware = createMiddleware()
  .client(async (ctx) => {
    console.log('Client Request:', ctx)

    const requestedAt = new Date()

    const res = await ctx.next({
      serverContext: {
        requestedAt,
      },
    })

    console.log('Client Response:', res)

    return res
  })
  .server(async (ctx) => {
    console.log('Server Request:', ctx)

    const res = await ctx.next()

    const duration = new Date().getTime() - ctx.context.requestedAt.getTime()

    console.log('Server Response:', {
      ...res,
      context: {
        duration,
      },
    })

    return res
  })
