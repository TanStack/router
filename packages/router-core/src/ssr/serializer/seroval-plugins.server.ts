import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import { RawStreamJSONPlugin } from './RawStreamJSONPlugin.server'
import type { Plugin } from 'seroval'

export const defaultSerovalPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  RawStreamJSONPlugin as Plugin<ReadableStream<Uint8Array>, any>,
  // ReadableStreamNode is not exported by seroval
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]
