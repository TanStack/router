import { createMiddleware } from '@tanstack/react-start'

// A request middleware: it runs for every request, before any route or
// server function. tests/tenant.server.test.ts runs it on its own.
export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const tenant = new URL(request.url).hostname.split('.')[0]!
    if (tenant === 'www') {
      return new Response('No tenant', { status: 404 })
    }
    const result = await next({ context: { tenant } })
    result.response.headers.set('x-tenant', tenant)
    return result
  },
)
