import { createServerFileRoute } from '@tanstack/react-start/server'
import { createMiddleware, json } from '@tanstack/react-start'

const testParentMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next({ context: { testParent: true } })
    return result
  },
)

const testMiddleware = createMiddleware({ type: 'request' })
  .middleware([testParentMiddleware])
  .server(async ({ next }) => {
    const result = await next({ context: { test: true } })
    return result
  })

export const ServerRoute = createServerFileRoute('/api/middleware-context')
  .middleware([testMiddleware])
  .methods({
    GET: ({ request, context }) => {
      return json({
        url: request.url,
        context: context,
        expectedContext: { testParent: true, test: true },
      })
    },
  })
