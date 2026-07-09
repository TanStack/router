import DescopeClient from '@descope/node-sdk'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import type { SessionUser } from './server'

// Server-only module: reached from the request middleware and from server
// function handlers, never from the client bundle. It is the only place that
// imports `@descope/node-sdk` and `@tanstack/react-start/server`.

// Descope stores the short-lived session token in the `DS` cookie and the
// refresh token in the `DSR` cookie by defaults.
const SESSION_COOKIE = DescopeClient.SessionTokenCookieName
const REFRESH_COOKIE = DescopeClient.RefreshTokenCookieName

let descopeClient: ReturnType<typeof DescopeClient> | undefined

function getDescopeClient() {
  if (!descopeClient) {
    descopeClient = DescopeClient({
      projectId: process.env.DESCOPE_PROJECT_ID!,
      // Only set for a self-hosted instance or a non-default region.
      baseUrl: process.env.DESCOPE_BASE_URL,
    })
  }
  return descopeClient
}

/**
 * Reads the Descope cookies from the current request, validates the session
 * (refreshing it if the session token has expired but a valid refresh token is
 * present), and returns the authenticated user — or `null` if not signed in.
 */
export async function resolveSessionFromRequest(): Promise<SessionUser | null> {
  const cookies = getCookies()
  const sessionToken = cookies[SESSION_COOKIE]
  const refreshToken = cookies[REFRESH_COOKIE]

  if (!sessionToken && !refreshToken) {
    return null
  }

  try {
    const authInfo = await getDescopeClient().validateAndRefreshSession(
      sessionToken,
      refreshToken,
    )

    // If the session token was rotated during refresh, persist the new value so
    // the browser and any subsequent requests stay in sync.
    if (authInfo.jwt && authInfo.jwt !== sessionToken) {
      setCookie(SESSION_COOKIE, authInfo.jwt, {
        httpOnly: false,
        sameSite: 'lax',
        secure: true,
        path: '/',
      })
    }

    const claims = authInfo.token
    return {
      userId: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
    }
  } catch {
    return null
  }
}

/** Clears the Descope session cookies (used on logout). */
export function clearSessionCookies() {
  setCookie(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  setCookie(REFRESH_COOKIE, '', { path: '/', maxAge: 0 })
}
