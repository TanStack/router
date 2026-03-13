import { createStart, createMiddleware } from '@tanstack/react-start'

export const requestLoggingMiddleware = createMiddleware().server(
  async ({ next, pathname }) => {
    const start = performance.now()
    console.log(`[request] → ${pathname}`)

    const result = await next({
      context: {
        requestStartTime: start,
        requestPathname: pathname,
      },
    })

    const duration = performance.now() - start
    console.log(`[request] ← ${pathname} (${duration.toFixed(1)}ms)`)

    return result
  },
)

export const rateLimitMiddleware = createMiddleware().server(
  async ({ next }) => {
    return next({
      context: {
        rateLimited: false,
      },
    })
  },
)

export const globalFunctionMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const start = performance.now()

  const result = await next({
    context: {
      globalFnMiddlewareApplied: true,
    },
  })

  const duration = performance.now() - start
  console.log(`[global-fn-middleware] executed in ${duration.toFixed(1)}ms`)

  return result
})

export const startInstance = createStart(() => ({
  requestMiddleware: [requestLoggingMiddleware, rateLimitMiddleware],
  functionMiddleware: [globalFunctionMiddleware],
}))
