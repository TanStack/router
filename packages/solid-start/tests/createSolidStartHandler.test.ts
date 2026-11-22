// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createMiddleware, createStart } from '@tanstack/start-client-core'
import {
  createServerEntry,
  handleStartError,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/start-server-core'
import { createSolidStartHandler } from '../src/createSolidStartHandler'
import type { AnyRequestMiddleware } from '@tanstack/start-client-core'

const app = vi.hoisted(() => ({
  requestMiddleware: [] as Array<unknown>,
}))

vi.mock('#tanstack-start-entry', () => ({
  startInstance: createStart(() => ({
    requestMiddleware: app.requestMiddleware as Array<AnyRequestMiddleware>,
  })),
}))

vi.mock('#tanstack-start-plugin-adapters', () => ({
  hasPluginAdapters: false,
  pluginSerializationAdapters: [],
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => ({ options: {}, update() {} }),
}))

// Their built output is compiled for the browser and cannot load in Node.
vi.mock('@tanstack/solid-router', () => ({
  createMemoryHistory: () => undefined,
}))
vi.mock('@tanstack/solid-start-server', async () => {
  return await import('@tanstack/start-server-core')
})
vi.mock('../src/server-functions-handler', () => ({
  handleSolidServerFunctionRequest: () => new Response('server function'),
}))

function serverFnRequest() {
  return new Request('http://localhost/_serverFn/test', { method: 'POST' })
}

describe('createSolidStartHandler server-function requests', () => {
  const handler = createSolidStartHandler(() => new Response('page'))

  beforeEach(() => {
    vi.stubEnv('TSS_SERVER_FN_BASE', '/_serverFn/')
    app.requestMiddleware = []
  })

  test('applies response helper writes to the response', async () => {
    app.requestMiddleware = [
      createMiddleware().server(() => {
        setResponseStatus(225, 'hello')
        setResponseHeader('x-helper', 'set')
        return new Response('body')
      }),
    ]

    const response = await handler(serverFnRequest())

    expect(response.status).toBe(225)
    expect(response.statusText).toBe('hello')
    expect(response.headers.get('x-helper')).toBe('set')
    expect(await response.text()).toBe('body')
  })

  test('rethrows a request middleware error to the caller', async () => {
    const error = new Error('middleware failed')
    app.requestMiddleware = [
      createMiddleware().server(() => {
        throw error
      }),
    ]

    await expect(handler(serverFnRequest())).rejects.toBe(error)
  })

  test('lets a custom server entry catch the error and keep helper writes', async () => {
    const error = new Error('middleware failed')
    const caught: Array<unknown> = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    app.requestMiddleware = [
      createMiddleware().server(() => {
        setResponseHeader('x-helper', 'set')
        throw error
      }),
    ]
    const entry = createServerEntry({
      async fetch(request) {
        try {
          return await handler(request)
        } catch (cause) {
          caught.push(cause)
          return handleStartError(cause)
        }
      },
    })

    const response = await entry.fetch(serverFnRequest())

    expect(caught).toEqual([error])
    expect(response.status).toBe(500)
    expect(response.headers.get('x-helper')).toBe('set')
  })
})
