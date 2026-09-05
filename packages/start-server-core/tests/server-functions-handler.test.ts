// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SERVER_FN_NOT_FOUND } from '../src/constants'

const resolverMocks = vi.hoisted(() => ({
  getServerFnById: vi.fn(),
}))

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: resolverMocks.getServerFnById,
}))

const { handleServerAction } = await import('../src/server-functions-handler')

const STALE_SERVER_FN_ID = 'stale-server-fn-id'
const KNOWN_SERVER_FN_ID = 'known-server-fn-id'
const SERVER_FN_URL = `http://localhost/_serverFn/${STALE_SERVER_FN_ID}`

/** The shape `@tanstack/start-plugin-core` emits for an id it cannot resolve. */
function serverFnNotFoundError(id: string) {
  const error = new Error(`Server function info not found for ${id}`) as Error &
    Record<string, unknown>
  error[SERVER_FN_NOT_FOUND] = true
  return error
}

function callHandler(serverFnId: string) {
  return handleServerAction({
    request: new Request(SERVER_FN_URL, { method: 'GET' }),
    context: {},
    serverFnId,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('handleServerAction', () => {
  it('keeps dispatching to a server function that resolves', async () => {
    const action = Object.assign(vi.fn(), { method: 'POST' as const })
    resolverMocks.getServerFnById.mockResolvedValueOnce(action)

    // A resolved function still reaches the existing method check, so this pins
    // the successful resolution path that the not-found handling wraps.
    const response = await callHandler(KNOWN_SERVER_FN_ID)

    expect(resolverMocks.getServerFnById).toHaveBeenCalledWith(
      KNOWN_SERVER_FN_ID,
      { origin: 'client' },
    )
    expect(response.status).toBe(405)
    expect(action).not.toHaveBeenCalled()
  })

  it('answers 404 when the id is not in this build', async () => {
    resolverMocks.getServerFnById.mockImplementationOnce(() => {
      throw serverFnNotFoundError(STALE_SERVER_FN_ID)
    })

    const response = await callHandler(STALE_SERVER_FN_ID)

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('text/plain')
    // The requested id is caller-supplied, so it must not be echoed back.
    expect(await response.text()).not.toContain(STALE_SERVER_FN_ID)
  })

  it('logs the unresolved id outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = serverFnNotFoundError(STALE_SERVER_FN_ID)
    resolverMocks.getServerFnById.mockImplementationOnce(() => {
      throw error
    })

    await callHandler(STALE_SERVER_FN_ID)

    expect(consoleError).toHaveBeenCalledWith(error)
  })

  it('stays quiet in production, where stale ids are routine traffic', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    resolverMocks.getServerFnById.mockImplementationOnce(() => {
      throw serverFnNotFoundError(STALE_SERVER_FN_ID)
    })

    const response = await callHandler(STALE_SERVER_FN_ID)

    expect(response.status).toBe(404)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('still surfaces a genuine resolver failure instead of masking it as 404', async () => {
    const resolverFailure = new Error('Server function module not resolved')
    resolverMocks.getServerFnById.mockImplementationOnce(() => {
      throw resolverFailure
    })

    await expect(callHandler(STALE_SERVER_FN_ID)).rejects.toBe(resolverFailure)
  })

  it('does not treat an inherited marker as a missing id', async () => {
    // Only the resolver sets the marker, and it sets it on the error itself.
    // Honouring an inherited one would answer 404 for an unrelated failure.
    class InheritsMarker extends Error {}
    ;(InheritsMarker.prototype as unknown as Record<string, unknown>)[
      SERVER_FN_NOT_FOUND
    ] = true
    const resolverFailure = new InheritsMarker('Server function module export')
    resolverMocks.getServerFnById.mockImplementationOnce(() => {
      throw resolverFailure
    })

    await expect(callHandler(STALE_SERVER_FN_ID)).rejects.toBe(resolverFailure)
  })
})
