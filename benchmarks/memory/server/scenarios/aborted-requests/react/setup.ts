import type { StartRequestHandler } from '#memory-server/bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const abortedRequestIterations = 100
let abortedRequestCounter = 0
const eagerMarker = 'data-bench="aborted-requests-eager"'
const alphaFallbackMarker = 'data-bench="aborted-requests-alpha-fallback"'
const betaFallbackMarker = 'data-bench="aborted-requests-beta-fallback"'
const alphaFirstRecord = (id: string) => `deferred-alpha-${id}-0`
const alphaLastRecord = (id: string) => `deferred-alpha-${id}-19`
const betaFirstRecord = (id: string) => `deferred-beta-${id}-0`
const betaLastRecord = (id: string) => `deferred-beta-${id}-19`

const textDecoder = new TextDecoder()
const documentRequestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function buildStreamRequest(id: string, signal?: AbortSignal) {
  const init: RequestInit = { ...documentRequestInit }

  if (signal) {
    init.signal = signal
  }

  return new Request(`http://localhost/stream/${id}`, init)
}

function validateDocumentResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

async function readFirstChunk(response: Response, request: Request) {
  if (!response.body) {
    throw new Error(`Expected response body for ${request.url}`)
  }

  const reader = response.body.getReader()
  const result = await reader.read()
  const value = result.value

  if (result.done || !value || value.byteLength === 0) {
    await reader.cancel()
    throw new Error(`Expected a non-empty first chunk for ${request.url}`)
  }

  return {
    reader,
    value,
  }
}

async function drainCancellationMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function assertAbortedRequestsSanity(handler: StartRequestHandler) {
  const fullId = 'sanity-full'
  const fullRequest = buildStreamRequest(fullId)
  const fullResponse = await handler.fetch(fullRequest)
  validateDocumentResponse(fullResponse, fullRequest)

  const fullBody = await fullResponse.text()

  if (!fullBody.includes(eagerMarker)) {
    throw new Error('Expected full sanity response to include the eager marker')
  }

  for (const marker of [
    alphaFirstRecord(fullId),
    alphaLastRecord(fullId),
    betaFirstRecord(fullId),
    betaLastRecord(fullId),
  ]) {
    if (!fullBody.includes(marker)) {
      throw new Error(`Expected full sanity response to include ${marker}`)
    }
  }

  const midStreamId = 'sanity-mid-stream'
  const controller = new AbortController()
  const midStreamRequest = buildStreamRequest(midStreamId, controller.signal)
  const midStreamResponse = await handler.fetch(midStreamRequest)
  validateDocumentResponse(midStreamResponse, midStreamRequest)

  const { reader, value } = await readFirstChunk(
    midStreamResponse,
    midStreamRequest,
  )
  const text = textDecoder.decode(value)

  if (!text.includes(eagerMarker)) {
    throw new Error('Expected first sanity chunk to include the eager marker')
  }

  if (
    !text.includes(alphaFallbackMarker) ||
    !text.includes(betaFallbackMarker)
  ) {
    throw new Error('Expected first sanity chunk to include deferred fallbacks')
  }

  for (const marker of [
    alphaFirstRecord(midStreamId),
    alphaLastRecord(midStreamId),
    betaFirstRecord(midStreamId),
    betaLastRecord(midStreamId),
  ]) {
    if (text.includes(marker)) {
      throw new Error(
        `First sanity chunk already included deferred content ${marker}`,
      )
    }
  }

  // reader.cancel() is the response-stream cancellation path if the handler
  // does not observe Request.signal for this in-process request.
  controller.abort()
  await reader.cancel()
  await drainCancellationMicrotasks()
}

async function runAbortedRequestLoop(handler: StartRequestHandler) {
  for (let index = 0; index < abortedRequestIterations; index++) {
    const controller = new AbortController()
    const id = `abort-${(abortedRequestCounter++).toString(36)}`
    const request = buildStreamRequest(id, controller.signal)
    const response = await handler.fetch(request)
    validateDocumentResponse(response, request)

    const { reader } = await readFirstChunk(response, request)
    controller.abort()
    await reader.cancel()
    await drainCancellationMicrotasks()
  }
}

export async function setup() {
  const { default: handler } = (await import(
    /* @vite-ignore */ appModuleUrl
  )) as {
    default: StartRequestHandler
  }

  const run = () => runAbortedRequestLoop(handler)

  return {
    sanity: () => assertAbortedRequestsSanity(handler),
    benches: [
      {
        name: 'mem aborted-requests (react)',
        run,
      },
    ],
  }
}
