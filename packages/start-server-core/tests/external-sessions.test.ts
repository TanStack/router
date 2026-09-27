// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMiddleware } from '@tanstack/start-client-core'
import { getIronSession } from 'iron-session'
import { createStartHandler } from '../src/createStartHandler'
import * as server from '../src/request-response'

const startMocks = vi.hoisted(() => ({
  requestMiddleware: [] as Array<unknown>,
}))
vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: startMocks.requestMiddleware,
      serializationAdapters: [],
    }),
  },
}))
vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => {
    throw new Error('The request middleware must handle the request')
  },
}))

function handler(run: (request: Request) => Promise<Response>) {
  startMocks.requestMiddleware = [
    createMiddleware().server(({ request }) => run(request)),
  ]
  return createStartHandler(() => {
    throw new Error('The request middleware must return a response')
  })
}

function request(cookie?: string, path = '/') {
  return new Request(`https://start.example${path}`, {
    headers: cookie ? { cookie } : undefined,
  })
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';', 1)[0])
    .join('; ')
}

const password = 'external-session-test-password-at-least-32-characters'
function iron(name = 'iron') {
  return getIronSession<{ user?: string; visits?: number }>(
    { read: server.getCookie, write: server.setCookie },
    { cookieName: name, password, ttl: 3600 },
  )
}

afterEach(() => {
  startMocks.requestMiddleware = []
})

describe('external sessions through public Start request middleware', () => {
  it('leaves session ownership to the application', () => {
    for (const name of [
      'defineSession',
      'useSession',
      'getSession',
      'updateSession',
      'clearSession',
      'sealSession',
      'unsealSession',
    ]) {
      expect(server).not.toHaveProperty(name)
    }
  })

  it('loads, saves and destroys an iron-session with the public cookie helpers', async () => {
    const app = handler(async (req) => {
      const session = await iron()
      if (req.url.endsWith('/login')) {
        session.user = 'alice'
        await session.save()
      } else if (req.url.endsWith('/logout')) {
        session.destroy()
      }
      return Response.json({ user: session.user ?? null })
    })
    const anonymous = await app(request(), {})
    expect(anonymous.headers.getSetCookie()).toEqual([])
    const login = await app(request(undefined, '/login'), {})
    expect(login.headers.getSetCookie()[0]).toMatch(/HttpOnly/i)
    expect(login.headers.getSetCookie()[0]).toMatch(/Secure/i)
    expect(await (await app(request(cookies(login)), {})).json()).toEqual({
      user: 'alice',
    })
    const logout = await app(request(cookies(login), '/logout'), {})
    expect(logout.headers.getSetCookie()[0]).toMatch(/Max-Age=0/i)
    expect(await (await app(request(cookies(logout)), {})).json()).toEqual({
      user: null,
    })
  })

  it('keeps each request and each separately named iron-session independent', async () => {
    const app = handler(async (req) => {
      const [auth, preferences] = await Promise.all([
        iron(),
        iron('preferences'),
      ])
      auth.user = new URL(req.url).searchParams.get('user')!
      preferences.visits = 3
      await Promise.all([auth.save(), preferences.save()])
      return Response.json({ user: auth.user })
    })
    const [alice, bob] = await Promise.all([
      app(request(undefined, '/?user=alice'), {}),
      app(request(undefined, '/?user=bob'), {}),
    ])
    expect(alice.headers.getSetCookie()).toHaveLength(2)
    expect(bob.headers.getSetCookie()).toHaveLength(2)
    const read = handler(async () => Response.json({ ...(await iron()) }))
    expect(await (await read(request(cookies(alice)), {})).json()).toEqual({
      user: 'alice',
    })
    expect(await (await read(request(cookies(bob)), {})).json()).toEqual({
      user: 'bob',
    })
  })

  it('keeps the last cookie write when a session is saved and then destroyed', async () => {
    const app = handler(async () => {
      const session = await iron()
      session.user = 'alice'
      await session.save()
      session.destroy()
      server.setCookie('other', 'value')
      return new Response('logged out')
    })
    const response = await app(request(), {})
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(
      response.headers.getSetCookie().find((c) => c.startsWith('iron=')),
    ).toMatch(/Max-Age=0/i)
  })

  it('preserves committed external cookies and response metadata on error responses', async () => {
    const app = handler(async () => {
      const session = await iron()
      session.user = 'alice'
      await session.save()
      server.setResponseHeader('x-session-test', 'retained')
      return new Response('validation failed', { status: 422 })
    })
    const response = await app(request(), {})
    expect(response.status).toBe(422)
    expect(response.headers.get('x-session-test')).toBe('retained')
    expect(response.headers.getSetCookie()).toHaveLength(1)
    const read = handler(async () => Response.json({ ...(await iron()) }))
    expect(await (await read(request(cookies(response)), {})).json()).toEqual({
      user: 'alice',
    })
  })

  it('preserves a committed cookie through the default thrown-error conversion', async () => {
    const app = handler(async () => {
      const session = await iron()
      session.visits = 1
      await session.save()
      throw new Error('application failure')
    })
    const response = await server
      .createServerEntry({ fetch: app })
      .fetch(request(), {})
    expect(response.status).toBe(500)
    expect(response.headers.getSetCookie()).toHaveLength(1)
  })
})
