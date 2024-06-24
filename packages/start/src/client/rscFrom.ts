// @ts-ignore

import * as reactDom from '@vinxi/react-server-dom/client'
import { isValidElement } from 'react'
import invariant from 'tiny-invariant'
import { createControlledPromise } from '@tanstack/react-router'

type MaybePromise<T> = T | Promise<T>

type CacheableElement<T> = T & {
  __rscState: {
    value: string
    promise: Promise<void>
  }
}

export async function rscFrom<
  T extends MaybePromise<ReadableStream | Response>,
>(input: T): Promise<CacheableElement<JSX.Element>> {
  if (input instanceof Promise || typeof (input as any)?.then === 'function') {
    input = await input
  }

  const state = {
    value: '',
    promise: createControlledPromise<void>(),
  }

  const element = await (async () => {
    // We're in node
    if (reactDom.createFromNodeStream) {
      const stream = await import('node:stream')

      // Now make a similar function but using node streams
      const copyStreamToRaw = (rs: NodeJS.ReadableStream) => {
        const pt = new stream.PassThrough()
        const pt2 = new stream.PassThrough()

        rs.pipe(pt)
        rs.pipe(pt2)

        let value = ''

        pt.on('data', (chunk) => {
          value += chunk
        })

        pt.on('end', () => {
          state.value = value
          state.promise.resolve()
        })

        pt.on('error', (error) => {
          state.promise.reject(error)
        })

        return pt2
      }

      let body: any = input

      // Unwrap the response
      if (input instanceof Response) {
        body = input.body
      }

      // Convert ReadableStream to NodeJS stream.Readable
      if (body instanceof ReadableStream) {
        body = stream.Readable.from(body as any)
      }

      if (stream.Readable.isReadable(body)) {
        body = copyStreamToRaw(body)
      } else if ((input as any).text) {
        // create a readable stream by awaiting the text method
        body = copyStreamToRaw(
          new stream.Readable({
            async read() {
              ;(input as any).text().then((value: any) => {
                this.push(value)
                this.push(null)
              })
            },
          }),
        )
      } else {
        console.error('input', input)
        throw new Error('Unexpected rsc input type 👆')
      }

      return reactDom.createFromNodeStream(body)
    }

    const copyReadableStreamToRaw = (rs: ReadableStream) => {
      // Use the tee pattern to clone the stream and cache the raw data
      // as a string for later use.
      const [rs1, rs2] = rs.tee()
      // Create a new Response object from the cloned stream
      // and cache the raw data as a string for later use.
      new Response(rs1)
        .text()
        .then((value) => {
          state.value = value
          state.promise.resolve()
        })
        .catch((error) => {
          state.promise.reject(error)
        })

      return rs2
    }

    // We're in the browser
    if (input instanceof ReadableStream) {
      return reactDom.createFromReadableStream(copyReadableStreamToRaw(input))
    } else {
      if (input.body instanceof ReadableStream) {
        return reactDom.createFromReadableStream(
          copyReadableStreamToRaw(input.body),
        )
      }
      // copy to the response body to cache the raw data
      state.value = await input.text()
      state.promise.resolve()
      return reactDom.createFromFetch(input)
    }
  })()

  invariant(isValidElement(element), 'Unexpected rsc input type')

  const cacheable = element as unknown as CacheableElement<JSX.Element>

  cacheable.__rscState = state

  return cacheable // This is renderable <div>{likeThis}</div>
}
