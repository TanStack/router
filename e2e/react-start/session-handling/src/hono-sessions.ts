import { useSession as useHonoSession } from '@hono/session'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { CookieStore, sessionMiddleware } from 'hono-sessions'
import { sessionPassword } from './session'
import type { SessionEnv } from '@hono/session'
import type { Session } from 'hono-sessions'

// These are genuine Hono applications. Start forwards the original Fetch
// Request and returns the Response after Hono has finished its middleware.
export const honoSessionApp = new Hono<SessionEnv<{ user: string }>>()
  .use(
    '*',
    useHonoSession({
      secret: new TextEncoder().encode('0123456789abcdef0123456789abcdef'),
      duration: { absolute: 3600 },
    }),
  )
  .get('/api/session-hono', async (c) =>
    c.json({ data: (await c.var.session.get()) ?? {} }),
  )
  .post('/api/session-hono', async (c) => {
    const data = await c.req.json<{ user: string }>()
    await c.var.session.update({ user: data.user })
    setCookie(c, 'hono-extra', '1', {
      path: '/',
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    return c.json({ data: c.var.session.data })
  })
  .delete('/api/session-hono', (c) => {
    c.var.session.delete()
    return c.json({ cleared: true })
  })

export const communitySessionApp = new Hono<{
  Variables: {
    session: Session<{ user: string }>
    session_key_rotation: boolean
  }
}>()
  .use(
    '*',
    sessionMiddleware({
      store: new CookieStore(),
      encryptionKey: sessionPassword,
      expireAfterSeconds: 3600,
      sessionCookieName: 'hono-community',
      cookieOptions: {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
      },
    }),
  )
  .get('/api/session-hono-community', (c) =>
    c.json({ data: { user: c.var.session.get('user') } }),
  )
  .post('/api/session-hono-community', async (c) => {
    const data = await c.req.json<{ user: string }>()
    c.var.session.set('user', data.user)
    return c.json({ data: { user: c.var.session.get('user') } })
  })
  .delete('/api/session-hono-community', (c) => {
    c.var.session.deleteSession()
    return c.json({ cleared: true })
  })
