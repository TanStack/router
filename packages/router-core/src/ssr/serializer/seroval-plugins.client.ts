import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import {
  RawStreamJSONPlugin,
  createRawStreamJSONPlugin,
} from './RawStreamJSONPlugin.client'
import type { RawStream } from './RawStream'
import type { Plugin } from 'seroval'

/* @__NO_SIDE_EFFECTS__ */
export function createDefaultSerovalPlugins(signal?: AbortSignal) {
  return [
    ShallowErrorPlugin as Plugin<Error, any>,
    (signal
      ? createRawStreamJSONPlugin(signal)
      : RawStreamJSONPlugin) as Plugin<RawStream, any>,
    // ReadableStreamNode is not exported by seroval
    ReadableStreamPlugin as Plugin<ReadableStream, any>,
  ]
}

export const defaultSerovalPlugins =
  /* @__PURE__ */ createDefaultSerovalPlugins()
