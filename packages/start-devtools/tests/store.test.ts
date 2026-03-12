import { describe, expect, it } from 'vitest'
import { processEvent, type RequestEntry } from '../src/store'

describe('processEvent', () => {
  function makeEntries(): Map<string, RequestEntry> {
    return new Map()
  }

  it('creates a new entry on request-start', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/api/test',
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        timestamp: 1000,
      },
    })

    expect(entries.has('r1')).toBe(true)
    const entry = entries.get('r1')!
    expect(entry.url).toBe('/api/test')
    expect(entry.method).toBe('GET')
    expect(entry.status).toBeNull()
    expect(entry.duration).toBeNull()
  })

  it('updates entry on request-end', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/api/test',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:request-end',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        type: 'server-fn',
        status: 200,
        duration: 50,
        responseHeaders: { 'x-custom': 'value' },
      },
    })

    const entry = entries.get('r1')!
    expect(entry.type).toBe('server-fn')
    expect(entry.status).toBe(200)
    expect(entry.duration).toBe(50)
    expect(entry.responseHeaders).toEqual({ 'x-custom': 'value' })
  })

  it('adds middleware phase on middleware-executed', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:middleware-executed',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        scope: 'request',
        chain: [{ name: 'auth', startTime: 100, endTime: 110 }],
        totalDuration: 10,
        startTime: 5,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.phases).toHaveLength(1)
    expect(entry.phases[0]!.name).toBe('request-middleware')
    expect(entry.phases[0]!.children).toHaveLength(1)
  })

  it('populates serverFn fields on server-fn-start', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'POST',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:server-fn-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        serverFnId: 'fn1',
        serverFnName: 'getUser',
        filename: 'src/api.ts',
        httpMethod: 'POST',
        inputPayloadType: 'json',
        startTime: 10,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.serverFn).toBeDefined()
    expect(entry.serverFn!.name).toBe('getUser')
  })

  it('records errors on error event', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:error',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        phase: 'middleware',
        message: 'Auth failed',
        stack: 'Error: Auth failed\n    at ...',
        timestamp: 1001,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.errors).toHaveLength(1)
    expect(entry.errors[0]!.message).toBe('Auth failed')
  })

  it('ignores events for unknown requestIds', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-end',
      pluginId: 'start',
      payload: {
        requestId: 'unknown',
        type: 'ssr',
        status: 200,
        duration: 50,
        responseHeaders: {},
      },
    })

    expect(entries.size).toBe(0)
  })

  it('closes open server-fn phase on server-fn-end', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'POST',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:server-fn-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        serverFnId: 'fn1',
        serverFnName: 'getUser',
        filename: 'api.ts',
        httpMethod: 'POST',
        inputPayloadType: 'json',
        startTime: 10,
      },
    })
    processEvent(entries, {
      type: 'start:server-fn-end',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        serverFnId: 'fn1',
        duration: 25,
        resultType: 'json',
        status: 200,
      },
    })

    const entry = entries.get('r1')!
    const phase = entry.phases.find((p) => p.name === 'server-fn')!
    expect(phase.duration).toBe(25)
    expect(phase.endTime).toBe(35)
    expect(entry.serverFn!.resultType).toBe('json')
  })

  it('populates ssr-end with sub-phase children', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:ssr-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        matchedRoute: '/',
        params: {},
        startTime: 5,
      },
    })
    processEvent(entries, {
      type: 'start:ssr-end',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        duration: 100,
        routerLoadDuration: 40,
        dehydrationDuration: 30,
        renderDuration: 30,
        hadRedirect: false,
      },
    })

    const entry = entries.get('r1')!
    const phase = entry.phases.find((p) => p.name === 'ssr')!
    expect(phase.duration).toBe(100)
    expect(phase.children).toHaveLength(3)
    expect(phase.children![0]!.name).toBe('router.load()')
    expect(phase.children![1]!.name).toBe('dehydrate()')
    expect(phase.children![2]!.name).toBe('render')
  })

  it('populates route match info', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:route-matched',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        matchedRoutes: [
          { id: '__root__', path: '/' },
          { id: '/posts', path: '/posts' },
        ],
        foundRoute: { id: '/posts', path: '/posts' },
        isExactMatch: true,
        params: { id: '1' },
        hasServerHandlers: false,
        timestamp: 1001,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.routeMatch).toBeDefined()
    expect(entry.routeMatch!.routes).toHaveLength(2)
    expect(entry.routeMatch!.params).toEqual({ id: '1' })
  })

  it('tracks stream chunks', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'POST',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:stream-chunk',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        serverFnId: 'fn1',
        chunkIndex: 1,
        timestamp: 1001,
      },
    })
    processEvent(entries, {
      type: 'start:stream-chunk',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        serverFnId: 'fn1',
        chunkIndex: 5,
        totalChunks: 5,
        timestamp: 1002,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.streamChunks).toHaveLength(2)
    expect(entry.streamChunks[1]!.index).toBe(5)
  })

  it('populates serialization info', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/',
        method: 'POST',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:serialization-result',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        format: 'ndjson',
        status: 200,
        contentType: 'application/x-ndjson',
        hasRawStreams: false,
        duration: 5,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.serialization).toBeDefined()
    expect(entry.serialization!.format).toBe('ndjson')
    expect(entry.serialization!.contentType).toBe('application/x-ndjson')
  })

  it('records redirect info', () => {
    const entries = makeEntries()
    processEvent(entries, {
      type: 'start:request-start',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        url: '/old',
        method: 'GET',
        headers: {},
        timestamp: 1000,
      },
    })
    processEvent(entries, {
      type: 'start:redirect',
      pluginId: 'start',
      payload: {
        requestId: 'r1',
        from: '/old',
        to: '/new',
        status: 302,
        isServerFn: false,
        timestamp: 1001,
      },
    })

    const entry = entries.get('r1')!
    expect(entry.redirect).toEqual({ from: '/old', to: '/new', status: 302 })
  })
})
