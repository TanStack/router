import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { RawStreamJSONDeserializePlugin } from './RawStreamJSONDeserializePlugin.client'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import type { Plugin } from 'seroval'

export const defaultSerovalDeserializerPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  RawStreamJSONDeserializePlugin as Plugin<ReadableStream<Uint8Array>, any>,
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]
