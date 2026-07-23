import { Feature, fromCrossJSON, toCrossJSONAsync } from 'seroval'
import {
  AbortSignalPlugin,
  CustomEventPlugin,
  DOMExceptionPlugin,
  EventPlugin,
  FormDataPlugin,
  HeadersPlugin,
  ReadableStreamPlugin,
  RequestPlugin,
  ResponsePlugin,
  URLPlugin,
  URLSearchParamsPlugin,
} from 'seroval-plugins/web'
import { getDefaultSerovalPlugins } from '@tanstack/start-client-core'
import type { Plugin as SerovalPlugin } from 'seroval'

// ---------------------------------------------------------------------------
// Wire constants of the @solidjs/web/server-functions transport. The shared
// layer types them but the client entry does not export them at runtime, so
// they are mirrored here. Values verified against @solidjs/web
// 2.0.0-beta.25 — keep the peer range tight when bumping.
// ---------------------------------------------------------------------------
export const FUNCTION_ID_HEADER = 'X-Server-Function-Id'
export const INSTANCE_HEADER = 'X-Server-Function-Instance'
export const BODY_FORMAT_HEADER = 'X-Server-Function-Format'
export const BODY_FORMAT_SERIALIZED = '0'
export const BODY_FORMAT_FORMDATA = '2'
/** Set on a Response to make handleServerFunctionRequest return it verbatim. */
export const X_CONTENT_RAW = 'X-Content-Raw'

// Mirrors DEFAULT_WEB_PLUGINS in @solidjs/web's serializer. The runtime's
// resolveSerializerPlugins appends these AFTER any custom codec plugins, so
// appending them after the TanStack plugins here yields the identical
// resolution order on both wire legs.
const SOLID_WEB_PLUGINS: Array<SerovalPlugin<any, any>> = [
  AbortSignalPlugin,
  CustomEventPlugin,
  DOMExceptionPlugin,
  EventPlugin,
  FormDataPlugin,
  HeadersPlugin,
  ReadableStreamPlugin,
  RequestPlugin,
  ResponsePlugin,
  URLSearchParamsPlugin,
  URLPlugin,
] as Array<SerovalPlugin<any, any>>

// Matches JSON_CODEC_DISABLED_FEATURES in @solidjs/web's serializer.
const DISABLED_FEATURES = Feature.RegExp

function getWirePlugins(): Array<SerovalPlugin<any, any>> {
  return [...getDefaultSerovalPlugins(), ...SOLID_WEB_PLUGINS]
}

/**
 * Codec options understood by @solidjs/web's server-function runtime
 * (decodeResponse / handleServerFunctionRequest). The runtime appends its own
 * web plugins, so only the TanStack plugins are passed.
 */
export function getWireCodecOptions(): { plugins: Array<any> } {
  return { plugins: getDefaultSerovalPlugins() }
}

/** Serializes a value to a seroval cross-JSON node string (no framing). */
export async function serializeWireJson(value: unknown): Promise<string> {
  const node = await toCrossJSONAsync(value, {
    refs: new Map(),
    plugins: getWirePlugins(),
    disabledFeatures: DISABLED_FEATURES,
  })
  return JSON.stringify(node)
}

/** Inverse of serializeWireJson. */
export function deserializeWireJson(serialized: string): unknown {
  return fromCrossJSON(JSON.parse(serialized), {
    refs: new Map(),
    plugins: getWirePlugins(),
    disabledFeatures: DISABLED_FEATURES,
  })
}

/**
 * Frames a payload for the @solidjs/web chunk-stream wire format:
 * `;0x<len32>;` (byte length, 8 hex digits) followed by the data. A single
 * frame is a valid stream — the server's ChunkReader reads it as the source
 * value and finds the stream done.
 */
export function frameWireChunk(data: string): string {
  const byteLength = new TextEncoder().encode(data).length
  const hex = byteLength.toString(16)
  return `;0x${'00000000'.substring(0, 8 - hex.length)}${hex};${data}`
}

/**
 * Serializes a wire value as a single framed chunk, suitable as a POST body
 * (BODY_FORMAT_SERIALIZED) or a GET `args` query parameter.
 */
export async function serializeWireBody(value: unknown): Promise<string> {
  return frameWireChunk(await serializeWireJson(value))
}
