import { createMiddleware, createStart } from '@tanstack/react-start'
import { recordCall } from './server-only'
import type { Locale } from './server-only'

// The global middleware of the app. It is not exported, as in most apps.
// tests/posts.server.test.ts shows how a test runs it and how a test leaves
// it out.
const localeMiddleware = createMiddleware().server(({ next, request }) => {
  const locale: Locale = request.headers
    .get('accept-language')
    ?.startsWith('de')
    ? 'de'
    : 'en'
  return next({ context: { locale } })
})

const auditMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next, serverFnMeta }) => {
    recordCall(serverFnMeta.name)
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware],
  functionMiddleware: [auditMiddleware],
}))
