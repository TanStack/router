import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

const clientId = process.env.GITHUB_CLIENT_ID
const clientSecret = process.env.GITHUB_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.warn(
    'Missing GITHUB_CLIENT_ID and/or GITHUB_CLIENT_SECRET environment variables. ' +
      'GitHub sign-in will not work until you copy .env.example to .env and fill in your GitHub OAuth credentials.',
  )
}

/**
 * Better Auth configuration for TanStack Start with GitHub
 */
export const auth = betterAuth({
  // Base URL and trusted origins are required for OAuth callbacks and CSRF protection
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  socialProviders: {
    github: {
      clientId: clientId ?? '',
      clientSecret: clientSecret ?? '',
    },
  },
  plugins: [
    // Must be last plugin in the array
    tanstackStartCookies(),
  ],
  // Stateless sessions (no database required)
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
})

// Export session type for use in router context
export type AuthSession = typeof auth.$Infer.Session
