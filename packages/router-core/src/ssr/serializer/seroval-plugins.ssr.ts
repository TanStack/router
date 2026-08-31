import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import { RawStreamSSRPlugin } from './RawStreamSSRPlugin'
import type { RawStream } from './RawStream'
import type { Plugin } from 'seroval'

export const defaultSerovalPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  RawStreamSSRPlugin as Plugin<RawStream, any>,
  // ReadableStreamNode is not exported by seroval
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]
