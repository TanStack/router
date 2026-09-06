// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const action = vi.fn()

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: vi.fn(async () => action),
}))

const { handleServerAction } = await import('../src/server-functions-handler')
const { requestHandler } = await import('../src/request-response')
const { runWithStartContext } = await import('@tanstack/start-storage-context')

const SERVER_FN_ID = 'test-server-fn'

/**
 * Invoke `handleServerAction` the way the request pipeline does, and hand back
 * whatever it returned so the test can assert on the raw value. The pipeline
 * requires a Response, so returning anything else is the defect under test.
 */
async function invokeServerFn(options: {
  returns: { result?: unknown; error?: unknown }
  /** Set the header the RPC client sends. Native form posts do not send it. */
  rpc?: boolean
}) {
  action.mockImplementation(async () => options.returns)

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (options.rpc) {
    headers['x-tsr-serverFn'] = 'true'
  }

  const request = new Request(`http://localhost/_serverFn/${SERVER_FN_ID}`, {
    method: 'POST',
    headers,
    body: 'name=Sean',
  })

  let returned: unknown
  const handler = requestHandler(async () =>
    runWithStartContext(
      {
        getRouter: () => ({}) as any,
        request,
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
      },
      async () => {
        returned = await handleServerAction({
          request,
          context: {},
          serverFnId: SERVER_FN_ID,
        })
        return new Response('unused')
      },
    ),
  )

  await handler(request, {})
  return returned
}

beforeEach(() => {
  action.mockReset()
  Object.assign(action, { method: 'POST' })
})

describe('handleServerAction with a non-RPC caller', () => {
  test('serializes a plain object into a Response', async () => {
    const returned = await invokeServerFn({ returns: { result: { ok: true } } })

    expect(returned).toBeInstanceOf(Response)
    const response = returned as Response
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    await expect(response.text()).resolves.toContain('ok')
  })

  test('returns a Response for a handler that returns nothing', async () => {
    const returned = await invokeServerFn({ returns: { result: undefined } })

    expect(returned).toBeInstanceOf(Response)
    expect((returned as Response).status).toBe(200)
  })

  test('returns a Response when the handler produced an error', async () => {
    const returned = await invokeServerFn({
      returns: { result: undefined, error: new Error('boom') },
    })

    expect(returned).toBeInstanceOf(Response)
  })

  test('passes a handler-provided Response through untouched', async () => {
    const returned = await invokeServerFn({
      returns: {
        result: new Response('done', {
          status: 201,
          headers: { 'Content-Type': 'text/plain' },
        }),
      },
    })

    expect(returned).toBeInstanceOf(Response)
    const response = returned as Response
    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe('text/plain')
    // A non-RPC caller is a browser or an external client, so the internal
    // raw-response marker must not be added.
    expect(response.headers.get('x-tss-raw')).toBeNull()
    await expect(response.text()).resolves.toBe('done')
  })

  test('passes a redirect Response through untouched', async () => {
    const { redirect } = await import('@tanstack/router-core')
    const returned = await invokeServerFn({
      returns: { result: redirect({ href: '/after-submit', statusCode: 302 }) },
    })

    expect(returned).toBeInstanceOf(Response)
    const response = returned as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/after-submit')
  })
})

describe('handleServerAction with the RPC client', () => {
  test('still serializes a plain object', async () => {
    const returned = await invokeServerFn({
      returns: { result: { ok: true } },
      rpc: true,
    })

    expect(returned).toBeInstanceOf(Response)
    const response = returned as Response
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
  })

  test('still marks a raw Response for the client to unwrap', async () => {
    const returned = await invokeServerFn({
      returns: { result: new Response('done', { status: 201 }) },
      rpc: true,
    })

    expect(returned).toBeInstanceOf(Response)
    const response = returned as Response
    expect(response.status).toBe(201)
    expect(response.headers.get('x-tss-raw')).toBe('true')
  })
})
