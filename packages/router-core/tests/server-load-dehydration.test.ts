import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'

function setup(
  outcome: 'success' | 'redirect' | 'lifecycle-error',
  phase: 'onEnter' | 'dehydrate' = 'onEnter',
) {
  const started = createControlledPromise<void>()
  const gate = createControlledPromise<void>()
  const reason = new Error('nested lifecycle failed')
  let calls = 0
  let reentered = false
  let fail = outcome === 'lifecycle-error'
  let nested: Promise<void> | undefined
  let nestedSettlement: Promise<Array<PromiseSettledResult<void>>> | undefined
  const startNested = () => {
    if (!reentered) {
      reentered = true
      nested = router.load()
      // The request and the explicit load independently observe rejection.
      nestedSettlement = Promise.allSettled([nested])
    }
  }
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: async () => {
      if (++calls > 1) {
        started.resolve()
        await gate
        if (outcome === 'redirect') {
          throw redirect({ href: '/target', statusCode: 307 })
        }
      }
      return 'ready'
    },
    onEnter: () => {
      if (phase === 'onEnter') {
        startNested()
      }
    },
    onStay: () => {
      if (fail) {
        fail = false
        throw reason
      }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    dehydrate:
      phase === 'dehydrate'
        ? async () => {
            startNested()
            gate.resolve()
            await nestedSettlement
            return {}
          }
        : undefined,
  })
  return {
    router,
    started,
    gate,
    reason,
    nested: () => nested!,
    finish: async () => {
      gate.resolve()
      await nestedSettlement
    },
  }
}

test('returns a redirect from a lifecycle-started load instead of rendering HTML', async () => {
  const fixture = setup('redirect')
  const render = vi.fn(() => new Response('unexpected HTML'))
  const responsePromise = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => fixture.router,
  })(render)
  try {
    await fixture.started
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(render).not.toHaveBeenCalled()
    fixture.gate.resolve()
    const response = await responsePromise
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/target')
    expect(render).not.toHaveBeenCalled()
    expect(fixture.router.state).toMatchObject({
      status: 'idle',
      isLoading: false,
    })
  } finally {
    await fixture.finish()
  }
})

test('skips custom dehydration when a lifecycle-started load settles as a redirect', async () => {
  const fixture = setup('redirect')
  const dehydrate = vi.fn(() => {
    throw new Error('Redirects must not invoke custom dehydration')
  })
  fixture.router.update({ dehydrate })
  const render = vi.fn(() => new Response('unexpected HTML'))
  const responsePromise = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => fixture.router,
  })(render)
  try {
    await fixture.started
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dehydrate).not.toHaveBeenCalled()
    fixture.gate.resolve()
    const response = await responsePromise
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/target')
    expect(dehydrate).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  } finally {
    await fixture.finish()
  }
})

test('rejects the request when a lifecycle-started load fails during dehydration', async () => {
  const fixture = setup('lifecycle-error')
  const render = vi.fn(() => new Response('unexpected HTML'))
  const responsePromise = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => fixture.router,
  })(render)
  const rejected = expect(responsePromise).rejects.toBe(fixture.reason)
  try {
    await fixture.started
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.gate.resolve()
    await rejected
    await expect(fixture.nested()).rejects.toBe(fixture.reason)
    expect(render).not.toHaveBeenCalled()
    expect(fixture.router.state).toMatchObject({
      status: 'idle',
      isLoading: false,
    })
  } finally {
    await fixture.finish()
  }
})

test('rejects dehydration when a lifecycle-started load failed before dehydration began', async () => {
  const fixture = setup('lifecycle-error')
  attachRouterServerSsrUtils({ router: fixture.router, manifest: undefined })
  const serverSsr = fixture.router.serverSsr!
  try {
    await fixture.router.load()
    await fixture.started
    fixture.gate.resolve()
    await expect(fixture.nested()).rejects.toBe(fixture.reason)
    expect(fixture.router.state).toMatchObject({
      status: 'idle',
      isLoading: false,
    })
    await expect(serverSsr.dehydrate()).rejects.toBe(fixture.reason)
  } finally {
    serverSsr.cleanup()
    await fixture.finish()
  }
})

test('rejects the request when a custom dehydration hook observes a nested load failure before returning', async () => {
  const fixture = setup('lifecycle-error', 'dehydrate')
  const render = vi.fn(() => new Response('unexpected HTML'))
  try {
    const responsePromise = createRequestHandler({
      request: new Request('http://localhost/'),
      createRouter: () => fixture.router,
    })(render)
    await expect(responsePromise).rejects.toBe(fixture.reason)
    await expect(fixture.nested()).rejects.toBe(fixture.reason)
    expect(render).not.toHaveBeenCalled()
  } finally {
    await fixture.finish()
  }
})

test.each(['before cleanup', 'after cleanup'] as const)(
  'a failed load settling %s does not poison a later SSR request on the router',
  async (timing) => {
    const fixture = setup('lifecycle-error')
    attachRouterServerSsrUtils({ router: fixture.router, manifest: undefined })
    const previousSsr = fixture.router.serverSsr!
    try {
      await fixture.router.load()
      await fixture.started
      if (timing === 'before cleanup') {
        fixture.gate.resolve()
        await expect(fixture.nested()).rejects.toBe(fixture.reason)
        await expect(previousSsr.dehydrate()).rejects.toBe(fixture.reason)
      }
      previousSsr.cleanup()
      attachRouterServerSsrUtils({
        router: fixture.router,
        manifest: undefined,
      })
      if (timing === 'after cleanup') {
        fixture.gate.resolve()
        await expect(fixture.nested()).rejects.toBe(fixture.reason)
      }
      await fixture.router.load()
      await fixture.router.serverSsr!.dehydrate()
      expect(fixture.router.state).toMatchObject({
        status: 'idle',
        isLoading: false,
      })
    } finally {
      fixture.router.serverSsr?.cleanup()
      await fixture.finish()
    }
  },
)

test('request abort stops waiting for an uncooperative lifecycle-started load', async () => {
  const fixture = setup('success')
  const controller = new AbortController()
  const reason = new Error('request disconnected')
  const render = vi.fn(() => new Response('unexpected HTML'))
  const responsePromise = createRequestHandler({
    request: new Request('http://localhost/', { signal: controller.signal }),
    createRouter: () => fixture.router,
  })(render)
  const rejected = expect(responsePromise).rejects.toBe(reason)
  try {
    await fixture.started
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort(reason)
    await rejected
    expect(render).not.toHaveBeenCalled()
    // The explicit nested load has its own lifetime, independent of the request.
    expect(fixture.router.state).toMatchObject({
      status: 'pending',
      isLoading: true,
    })
    await fixture.finish()
    expect(fixture.router.state).toMatchObject({
      status: 'idle',
      isLoading: false,
    })
  } finally {
    await fixture.finish()
  }
})
