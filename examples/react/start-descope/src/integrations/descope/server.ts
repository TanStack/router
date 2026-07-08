import { createServerFn, getGlobalStartContext } from '@tanstack/react-start'

// The key under which `descopeMiddleware` stores the resolved user on the
// global request context.
export const DESCOPE_CONTEXT_KEY = 'descopeUser'

export interface SessionUser {
  userId: string
  email?: string
  name?: string
}

/** Reads the user resolved by `descopeMiddleware` off the global context. */
function userFromContext(): SessionUser | null {
  const ctx = getGlobalStartContext() as Record<string, unknown> | undefined
  return (ctx?.[DESCOPE_CONTEXT_KEY] as SessionUser | null | undefined) ?? null
}

/**
 * Server function exposing the current session to route `beforeLoad`. Works
 * during SSR and during client-side navigation (via an RPC that re-runs the
 * request middleware).
 */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionUser | null> => userFromContext(),
)

/** Clears the Descope session cookies (used on logout). */
export const clearServerSession = createServerFn().handler(async () => {
  const { clearSessionCookies } = await import('./session.server')
  clearSessionCookies()
})
