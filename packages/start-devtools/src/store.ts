import { createSignal } from 'solid-js'
import { startEventClient } from '@tanstack/start-server-core/event-client'

export interface RequestEntry {
  requestId: string
  url: string
  method: string
  type: 'server-fn' | 'ssr' | 'server-route' | null
  headers: Record<string, string>
  status: number | null
  startTimestamp: number
  duration: number | null

  phases: Array<{
    name: string
    startTime: number
    endTime: number | null
    duration: number | null
    children?: Array<{
      name: string
      startTime: number
      endTime: number
      exclusiveDuration: number
    }>
  }>

  routeMatch?: {
    routes: Array<{ id: string; path: string }>
    params: Record<string, string>
  }
  serverFn?: {
    id: string
    name: string
    filename: string
    inputType: string
    resultType?: string
  }
  serialization?: {
    format: string
    contentType: string
    hasRawStreams: boolean
  }
  streamChunks: Array<{ index: number; timestamp: number }>
  redirect?: { from: string; to: string; status: number }
  errors: Array<{ phase: string; message: string; stack?: string }>
  responseHeaders: Record<string, string> | null
}

function createEmptyEntry(
  requestId: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  timestamp: number,
): RequestEntry {
  return {
    requestId,
    url,
    method,
    type: null,
    headers,
    status: null,
    startTimestamp: timestamp,
    duration: null,
    phases: [],
    streamChunks: [],
    errors: [],
    responseHeaders: null,
  }
}

function computeExclusiveDuration(
  chain: Array<{ name: string; startTime: number; endTime: number }>,
): Array<{
  name: string
  startTime: number
  endTime: number
  exclusiveDuration: number
}> {
  return chain.map((mw) => {
    const nested = chain.filter(
      (other) =>
        other !== mw &&
        other.startTime >= mw.startTime &&
        other.endTime <= mw.endTime,
    )
    const nestedTime = nested.reduce(
      (sum, n) => sum + (n.endTime - n.startTime),
      0,
    )
    return {
      ...mw,
      exclusiveDuration: mw.endTime - mw.startTime - nestedTime,
    }
  })
}

export function processEvent(
  entries: Map<string, RequestEntry>,
  event: { type: string; pluginId: string; payload: any },
): void {
  const suffix = event.type.replace(`${event.pluginId}:`, '')
  const payload = event.payload

  switch (suffix) {
    case 'request-start': {
      if (!entries.has(payload.requestId)) {
        entries.set(
          payload.requestId,
          createEmptyEntry(
            payload.requestId,
            payload.url,
            payload.method,
            payload.headers,
            payload.timestamp,
          ),
        )
      }
      break
    }

    case 'request-end': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.type = payload.type
      entry.status = payload.status
      entry.duration = payload.duration
      entry.responseHeaders = payload.responseHeaders
      if (payload.error) {
        entry.errors.push({
          phase: 'request',
          message: payload.error.message,
          stack: payload.error.stack,
        })
      }
      break
    }

    case 'middleware-executed': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.phases.push({
        name: `${payload.scope}-middleware`,
        startTime: payload.startTime,
        endTime: payload.startTime + payload.totalDuration,
        duration: payload.totalDuration,
        children: computeExclusiveDuration(payload.chain),
      })
      break
    }

    case 'server-fn-start': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.serverFn = {
        id: payload.serverFnId,
        name: payload.serverFnName,
        filename: payload.filename,
        inputType: payload.inputPayloadType,
      }
      entry.phases.push({
        name: 'server-fn',
        startTime: payload.startTime,
        endTime: null,
        duration: null,
      })
      break
    }

    case 'server-fn-end': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      if (entry.serverFn) {
        entry.serverFn.resultType = payload.resultType
      }
      const phase = entry.phases.find(
        (p) => p.name === 'server-fn' && p.endTime === null,
      )
      if (phase) {
        phase.endTime = phase.startTime + payload.duration
        phase.duration = payload.duration
      }
      if (payload.error) {
        entry.errors.push({
          phase: 'server-fn',
          message: payload.error.message,
          stack: payload.error.stack,
        })
      }
      break
    }

    case 'ssr-start': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.phases.push({
        name: 'ssr',
        startTime: payload.startTime,
        endTime: null,
        duration: null,
      })
      break
    }

    case 'ssr-end': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      const phase = entry.phases.find(
        (p) => p.name === 'ssr' && p.endTime === null,
      )
      if (phase) {
        phase.endTime = phase.startTime + payload.duration
        phase.duration = payload.duration
        phase.children = [
          {
            name: 'router.load()',
            startTime: 0,
            endTime: payload.routerLoadDuration,
            exclusiveDuration: payload.routerLoadDuration,
          },
          {
            name: 'dehydrate()',
            startTime: payload.routerLoadDuration,
            endTime: payload.routerLoadDuration + payload.dehydrationDuration,
            exclusiveDuration: payload.dehydrationDuration,
          },
          {
            name: 'render',
            startTime:
              payload.routerLoadDuration + payload.dehydrationDuration,
            endTime:
              payload.routerLoadDuration +
              payload.dehydrationDuration +
              payload.renderDuration,
            exclusiveDuration: payload.renderDuration,
          },
        ]
      }
      break
    }

    case 'route-matched': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.routeMatch = {
        routes: payload.matchedRoutes,
        params: payload.params,
      }
      break
    }

    case 'serialization-result': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.serialization = {
        format: payload.format,
        contentType: payload.contentType,
        hasRawStreams: payload.hasRawStreams,
      }
      break
    }

    case 'stream-chunk': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.streamChunks.push({
        index: payload.chunkIndex,
        timestamp: payload.timestamp,
      })
      break
    }

    case 'redirect': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.redirect = {
        from: payload.from,
        to: payload.to,
        status: payload.status,
      }
      break
    }

    case 'error': {
      const entry = entries.get(payload.requestId)
      if (!entry) return
      entry.errors.push({
        phase: payload.phase,
        message: payload.message,
        stack: payload.stack,
      })
      break
    }
  }
}

export function createRequestStore() {
  const [entries, setEntries] = createSignal<Map<string, RequestEntry>>(
    new Map(),
  )

  const cleanup = startEventClient.onAllPluginEvents((event: any) => {
    setEntries((prev) => {
      const next = new Map(prev)
      processEvent(next, event)
      return next
    })
  })

  return {
    get entries() {
      return entries()
    },
    clear() {
      setEntries(new Map())
    },
    cleanup,
  }
}
