import { EventClient } from '@tanstack/devtools-event-client'

export interface StartEventMap {
  // === Major Phase Pairs (waterfall bars) ===

  'request-start': {
    requestId: string
    url: string
    method: string
    headers: Record<string, string>
    timestamp: number
  }

  'request-end': {
    requestId: string
    type: 'server-fn' | 'ssr' | 'server-route'
    status: number
    duration: number
    responseHeaders: Record<string, string>
    error?: { message: string; stack?: string }
  }

  'server-fn-start': {
    requestId: string
    serverFnId: string
    serverFnName: string
    filename: string
    httpMethod: string
    inputPayloadType: 'json' | 'formdata' | 'query-string' | 'none'
    startTime: number
  }

  'server-fn-end': {
    requestId: string
    serverFnId: string
    duration: number
    resultType:
      | 'json'
      | 'ndjson-stream'
      | 'framed-binary'
      | 'raw-response'
      | 'redirect'
      | 'not-found'
      | 'error'
    status: number
    error?: { message: string; stack?: string }
  }

  'ssr-start': {
    requestId: string
    matchedRoute: string
    params: Record<string, string>
    startTime: number
  }

  'ssr-end': {
    requestId: string
    duration: number
    routerLoadDuration: number
    dehydrationDuration: number
    renderDuration: number
    hadRedirect: boolean
  }

  // === Consolidated Events (rich payloads) ===

  'middleware-executed': {
    requestId: string
    scope: 'request' | 'route' | 'server-fn'
    chain: Array<{
      name: string
      startTime: number
      endTime: number
    }>
    totalDuration: number
    startTime: number
  }

  'route-matched': {
    requestId: string
    matchedRoutes: Array<{ id: string; path: string }>
    foundRoute: { id: string; path: string } | null
    isExactMatch: boolean
    params: Record<string, string>
    hasServerHandlers: boolean
    timestamp: number
  }

  'serialization-result': {
    requestId: string
    format: 'json' | 'ndjson' | 'framed-binary' | 'raw-response'
    status: number
    contentType: string
    hasRawStreams: boolean
    duration: number
  }

  'stream-chunk': {
    requestId: string
    serverFnId: string
    chunkIndex: number
    totalChunks?: number
    timestamp: number
  }

  redirect: {
    requestId: string
    from: string
    to: string
    status: number
    isServerFn: boolean
    timestamp: number
  }

  error: {
    requestId: string
    phase:
      | 'middleware'
      | 'routing'
      | 'server-fn'
      | 'ssr'
      | 'serialization'
    message: string
    stack?: string
    timestamp: number
  }
}

class StartEventClient extends EventClient<StartEventMap> {
  constructor() {
    super({
      pluginId: 'start',
      enabled: process.env.NODE_ENV !== 'production',
    })
  }
}

export const startEventClient = new StartEventClient()
