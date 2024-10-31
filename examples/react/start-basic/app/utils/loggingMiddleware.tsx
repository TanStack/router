import { createMiddleware } from '@tanstack/start'

export const logMiddleware = createMiddleware()
  .client(async (ctx) => {
    const requestedAt = new Date()

    const res = await ctx.next({
      context: {
        requestedAt,
      },
      serverContext: {
        requestedAt,
      },
    })

    console.log(typeof document !== 'undefined' ? 'Client' : 'Server')
    console.log('Response:', res)

    return res
  })
  .server(async (ctx) => {
    console.log('Request:', ctx)

    const res = await ctx.next()

    const duration = new Date().getTime() - ctx.context.requestedAt.getTime()

    console.log('Response:', {
      ...res,
      context: {
        duration,
      },
    })

    return res
  })
