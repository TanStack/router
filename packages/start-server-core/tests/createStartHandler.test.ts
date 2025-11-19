import { beforeEach, describe, expect, it } from 'vitest'
import { createStartHandler } from '../src'
import { currentHandlers } from './mocks/router-entry'

const spaFallback = async () =>
  new Response('<!doctype html><div>spa</div>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })

function makeApp() {
  return createStartHandler(async () => await spaFallback())
}
beforeEach(() => {
  Object.keys(currentHandlers).forEach((key) => delete currentHandlers[key])
})

describe('createStartHandler — server route HTTP method handling', function () {
  it('should return 404 JSON for GET when only POST is defined (no SPA fallback)', async function () {
    currentHandlers.POST = () => new Response('ok', { status: 200 })
    const app = makeApp()

    const res = await app(
      new Request('http://localhost/api/test-no-get', { method: 'GET' }),
    )

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toMatch(/application\/json/i)
    const txt = await res.text()
    expect(txt).toContain('Not Found')
    expect(txt.toLowerCase().startsWith('<!doctype html>')).toBe(false)
  })

  it('should return 200 for POST and execute the route handler', async function () {
    currentHandlers.POST = () => new Response('ok', { status: 200 })
    const app = makeApp()

    const res = await app(
      new Request('http://localhost/api/test-no-get', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('should return 404 for HEAD when GET is not defined', async function () {
    currentHandlers.POST = () => new Response('ok', { status: 200 })
    const app = makeApp()

    const res = await app(
      new Request('http://localhost/api/test-no-get', { method: 'HEAD' }),
    )

    expect(res.status).toBe(404)
  })

  it('should use GET handler when HEAD is requested and GET exists', async function () {
    currentHandlers.GET = () => new Response('hello', { status: 200 })
    const app = makeApp()

    const res = await app(
      new Request('http://localhost/api/has-get', { method: 'HEAD' }),
    )

    expect(res.status).toBe(200)
  })

  it('should execute ANY handler for unsupported methods (e.g., PUT)', async function () {
    currentHandlers.ANY = () => new Response('ok-any', { status: 200 })
    const app = makeApp()

    const res = await app(
      new Request('http://localhost/api/any', { method: 'PUT' }),
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok-any')
  })
})
