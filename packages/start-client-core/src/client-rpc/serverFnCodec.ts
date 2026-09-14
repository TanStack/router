import { createRawStreamDeserializePlugin } from '@tanstack/router-core'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import { createSerovalPlugins } from '../createSerovalPlugins'
import { validateFramedProtocolVersion } from '../framed-protocol'
import { TSS_CONTENT_TYPE_FRAMED } from '../framed-content-type'
import { createFrameDecoder } from './frame-decoder'
import { setPostProcessContext as setBundledPostProcessContext } from './postProcessContext'
import type { AnySerializationAdapter } from '@tanstack/router-core'
import type { Plugin } from 'seroval'

let serovalPlugins: Array<Plugin<any, any>> | undefined
function getPlugins(
  adapters: ReadonlyArray<AnySerializationAdapter> | undefined,
) {
  return (serovalPlugins ??= createSerovalPlugins(adapters))
}

export async function serialize(
  data: unknown,
  adapters: ReadonlyArray<AnySerializationAdapter> | undefined,
) {
  return JSON.stringify(
    await toJSONAsync(data, { plugins: getPlugins(adapters) }),
  )
}

export async function deserialize(
  response: Response,
  contentType: string,
  adapters: ReadonlyArray<AnySerializationAdapter> | undefined,
  framed?: boolean,
  setPostProcessContext?: typeof setBundledPostProcessContext,
) {
  const setContext =
    process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
      ? setPostProcessContext!
      : setBundledPostProcessContext
  const plugins = getPlugins(adapters)
  let result

  // If it's a framed response (contains RawStream), use frame decoder
  if (
    process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
      ? framed
      : contentType.includes(TSS_CONTENT_TYPE_FRAMED)
  ) {
    // Validate protocol version compatibility
    validateFramedProtocolVersion(contentType)

    if (!response.body) {
      throw new Error('No response body for framed response')
    }

    const { getStream, chunks } = createFrameDecoder(response.body)

    // Create deserialize plugin that wires up the raw streams
    const rawStreamPlugin = createRawStreamDeserializePlugin(getStream)
    const framedPlugins = [rawStreamPlugin, ...plugins]

    const refs = new Map()
    result = await processFramedResponse(
      {
        jsonStream: chunks,
        onMessage: (msg: any) =>
          fromCrossJSON(msg, { refs, plugins: framedPlugins }),
        onError(msg, error) {
          console.error(msg, error)
        },
      },
      process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
        ? setPostProcessContext
        : undefined,
    )
  }
  // If it's a JSON response, it can be simpler
  else if (contentType.includes('application/json')) {
    const jsonPayload = await response.json()
    // Track async post-processing work for this deserialization
    const postProcessPromises: Array<Promise<unknown>> = []
    setContext(postProcessPromises)
    try {
      result = fromCrossJSON(jsonPayload, { plugins })
    } finally {
      setContext(null)
    }
    // Await any async post-processing before returning
    await awaitPostProcessPromises(postProcessPromises)
  }

  if (result instanceof Error) {
    throw result
  }

  return result
}

/**
 * Processes a framed response where each JSON chunk is a complete JSON string
 * (already decoded by frame decoder).
 *
 * Uses per-chunk post-processing context to ensure async deserialization work
 * completes before the next chunk is processed. This prevents issues when
 * streaming values require async post-processing (e.g., RSC decoding).
 */
async function processFramedResponse(
  {
    jsonStream,
    onMessage,
    onError,
  }: {
    jsonStream: ReadableStream<string>
    onMessage: (msg: any) => any
    onError?: (msg: string, error?: any) => void
  },
  setPostProcessContext?: typeof setBundledPostProcessContext,
) {
  const setContext =
    process.env.TSS_SERVER_FN_TRANSPORT === 'lazy'
      ? setPostProcessContext!
      : setBundledPostProcessContext
  const reader = jsonStream.getReader()

  // Read first JSON frame - this is the main result
  const { value: firstValue, done: firstDone } = await reader.read()
  if (firstDone || !firstValue) {
    throw new Error('Stream ended before first object')
  }

  // Each frame is a complete JSON string
  const firstObject = JSON.parse(firstValue)

  // Process remaining frames for streaming refs like RawStream.
  // Keep draining until the server closes the stream.
  // Each chunk gets its own post-processing context to properly scope async work.
  let drainCancelled = false as boolean
  const drain = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (value) {
          try {
            // Set up post-processing context for this chunk
            const chunkPostProcessPromises: Array<Promise<unknown>> = []
            setContext(chunkPostProcessPromises)
            try {
              onMessage(JSON.parse(value))
            } finally {
              setContext(null)
            }
            // Await any async post-processing from this chunk before processing next.
            // This ensures values requiring async work are ready before their
            // containing Promise/Stream resolves/emits to consumers.
            await awaitPostProcessPromises(chunkPostProcessPromises)
          } catch (e) {
            onError?.(`Invalid JSON: ${value}`, e)
          }
        }
      }
    } catch (err) {
      if (!drainCancelled) {
        onError?.('Stream processing error:', err)
      }
    }
  })()

  // Process first object with its own post-processing context
  let result: any
  const initialPostProcessPromises: Array<Promise<unknown>> = []
  setContext(initialPostProcessPromises)
  try {
    result = onMessage(firstObject)
  } catch (err) {
    setContext(null)
    drainCancelled = true
    reader.cancel().catch(() => {})
    throw err
  }
  setContext(null)

  // Await initial post-processing promises before returning result
  await awaitPostProcessPromises(initialPostProcessPromises)

  // If the initial decode fails async, stop draining to avoid holding
  // onto the response body and raw stream buffers unnecessarily.
  Promise.resolve(result).catch(() => {
    drainCancelled = true
    reader.cancel().catch(() => {})
  })

  // Detach reader once draining completes.
  drain.finally(() => {
    try {
      reader.releaseLock()
    } catch {
      // Ignore
    }
  })

  return result
}

/**
 * Helper to await all post-processing promises.
 * Uses Promise.allSettled to ensure all promises complete even if some reject.
 */
async function awaitPostProcessPromises(
  promises: Array<Promise<unknown>>,
): Promise<void> {
  if (promises.length > 0) {
    await Promise.allSettled(promises)
  }
}
