// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'

const action = vi.fn()

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: vi.fn(async () => action),
}))

const { handleServerAction } = await import('../src/server-functions-handler')

const SERVER_FN_ID = 'test-server-fn'

function invoke(request: Request) {
  return runWithStartContext(
    {
      getRouter: () => ({}) as any,
      request,
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      handleServerAction({
        request,
        context: {},
        serverFnId: SERVER_FN_ID,
      }),
  )
}

beforeEach(() => {
  action.mockReset()
  action.mockImplementation(async () => ({ result: { ok: true } }))
})

describe('handleServerAction invalid JSON payloads', () => {
  test('returns 400 for a malformed GET payload instead of an unhandled 500', async () => {
    Object.assign(action, { method: 'GET' })

    const request = new Request(
      `http://localhost/_serverFn/${SERVER_FN_ID}?payload=%7Bgarbage%7D`,
      {
        method: 'GET',
        headers: { 'x-tsr-serverFn': 'true' },
      },
    )

    const result = await invoke(request)

    expect(result).toBeInstanceOf(Response)
    const response = result as Response
    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toBe(
      'Invalid server function payload',
    )
    expect(action).not.toHaveBeenCalled()
  })

  test('returns 400 for a malformed JSON POST body instead of an unhandled 500', async () => {
    Object.assign(action, { method: 'POST' })

    const request = new Request(`http://localhost/_serverFn/${SERVER_FN_ID}`, {
      method: 'POST',
      headers: {
        'x-tsr-serverFn': 'true',
        'Content-Type': 'application/json',
      },
      body: '{garbage}',
    })

    const result = await invoke(request)

    expect(result).toBeInstanceOf(Response)
    const response = result as Response
    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toBe(
      'Invalid server function payload',
    )
    expect(action).not.toHaveBeenCalled()
  })
})
