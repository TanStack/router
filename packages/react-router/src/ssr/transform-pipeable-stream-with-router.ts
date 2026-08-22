import { Readable } from 'node:stream'
import { transformStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { TransformStreamWithRouterOptions } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

export function transformPipeableStreamWithRouter(
  router: AnyRouter,
  routerStream: Readable,
  opts?: TransformStreamWithRouterOptions,
) {
  const appStream = Readable.toWeb(routerStream) as unknown as ReadableStream
  const transformedStream = transformStreamWithRouter(router, appStream, opts)

  return Readable.fromWeb(transformedStream as unknown as NodeReadableStream)
}
