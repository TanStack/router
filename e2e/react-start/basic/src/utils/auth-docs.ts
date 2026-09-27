import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { getIronSession } from 'iron-session'

function getSession() {
  return getIronSession<{ email: string }>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'auth-docs-test',
      password: 'authentication-docs-browser-test-secret-only-2026',
      ttl: 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}

export const getCurrentUserFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    return session.email ? { email: session.email } : null
  },
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    // Fixed credentials belong only to this browser-test fixture.
    if (
      data.email !== 'reader@example.com' ||
      data.password !== 'test-password'
    ) {
      return { error: 'Invalid credentials' }
    }
    const session = await getSession()
    session.email = data.email
    await session.save()
    throw redirect({ to: '/auth-docs/private' })
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await getSession()
  session.destroy()
  throw redirect({ to: '/auth-docs' })
})

export const getPrivateDataFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    if (!session.email) {
      throw new Error('Unauthorized')
    }
    return 'Private account data'
  },
)
