import { createMiddleware } from '@tanstack/start'

export const logMiddleware = createMiddleware().server(async (ctx) => {
  const requestedAt = new Date()

  console.log('Request:', ctx)

  const res = await ctx.next({
    context: {
      requestedAt,
    },
  })

  const duration = new Date().getTime() - requestedAt.getTime()

  console.log('Response:', {
    ...res,
    context: {
      ...res.context,
      duration,
    },
  })

  return res
})
