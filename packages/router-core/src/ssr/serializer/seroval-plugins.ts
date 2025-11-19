import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import type { Plugin } from 'seroval'

export const defaultSerovalPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  // ReadableStreamNode is not exported by seroval
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]
