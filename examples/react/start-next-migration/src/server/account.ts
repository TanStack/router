import { getIronSession } from 'iron-session'
import { createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  setCookie,
  setResponseStatus,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
async function session() {
  setResponseHeader('Cache-Control', 'private, no-store')
  const password = process.env.SESSION_PASSWORD
  if (!password || password.length < 32) {
    throw new Error('Set SESSION_PASSWORD to at least 32 characters')
  }
  return getIronSession<{ email: string; saved: boolean }>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'start-migration-session',
      password,
      ttl: 7 * 24 * 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}
export const getAccount = createServerFn({ method: 'GET' }).handler(
  async () => {
    const current = await session()
    return current.email
      ? { email: current.email, saved: current.saved ?? false }
      : null
  },
)
export const signIn = createServerFn({ method: 'POST' })
  .validator((input: { email: string; password: string }) => {
    if (typeof input.email !== 'string' || typeof input.password !== 'string') {
      throw new Error('Invalid credentials')
    }
    return input
  })
  .handler(async ({ data }) => {
    if (!process.env.DEMO_PASSWORD) {
      throw new Error('Set DEMO_PASSWORD before running the example')
    }
    if (
      data.email !== 'reader@example.com' ||
      data.password !== process.env.DEMO_PASSWORD
    ) {
      return { error: 'Invalid credentials' }
    }
    const current = await session()
    current.email = data.email
    current.saved = false
    await current.save()
    return { error: '' }
  })
export const toggleSaved = createServerFn({ method: 'POST' }).handler(
  async () => {
    const current = await session()
    if (!current.email) {
      setResponseStatus(401)
      throw new Error('Unauthorized')
    }
    current.saved = !current.saved
    await current.save()
  },
)
export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const current = await session()
  current.destroy()
  throw redirect({ to: '/login' })
})
