import { createServerMiddleware } from '@tanstack/start'

export const logMiddleware = createServerMiddleware({
  id: 'logMiddleware',
}).use(async (ctx) => {
  const requestedAt = new Date()

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
