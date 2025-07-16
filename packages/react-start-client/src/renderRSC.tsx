// TODO: RSCs
import { isValidElement } from 'react'
import invariant from 'tiny-invariant'
import type React from 'react'

export function renderRsc(input: any): React.JSX.Element {
  if (isValidElement(input)) {
    return input
  }

  if (typeof input === 'object' && !input.state) {
    input.state = {
      status: 'pending',
      promise: Promise.resolve()
        .then(() => {
          let element

          // We're in node
          // TODO: RSCs
          // if (reactDom.createFromNodeStream) {
          //   const stream = await import('node:stream')

          //   let body: any = input

          //   // Unwrap the response
          //   if (input instanceof Response) {
          //     body = input.body
          //   }

          //   // Convert ReadableStream to NodeJS stream.Readable
          //   if (body instanceof ReadableStream) {
          //     body = stream.Readable.fromWeb(body as any)
          //   }

          //   if (stream.Readable.isReadable(body)) {
          //     // body = copyStreamToRaw(body)
          //   } else if (input.text) {
          //     // create a readable stream by awaiting the text method
          //     body = new stream.Readable({
          //       async read() {
          //         input.text().then((value: any) => {
          //           this.push(value)
          //           this.push(null)
          //         })
          //       },
          //     })
          //   } else {
          //     console.error('input', input)
          //     throw new Error('Unexpected rsc input type 👆')
          //   }

          //   element = await reactDom.createFromNodeStream(body)
          // } else {
          //   // We're in the browser
          //   if (input.body instanceof ReadableStream) {
          //     input = input.body
          //   }

          //   if (input instanceof ReadableStream) {
          //     element = await reactDom.createFromReadableStream(input)
          //   }

          //   if (input instanceof Response) {
          //     // copy to the response body to cache the raw data
          //     element = await reactDom.createFromFetch(input)
          //   }
          // }

          // return element

          invariant(false, 'renderRSC() is coming soon!')
        })
        .then((element) => {
          input.state.value = element
          input.state.status = 'success'
        })
        .catch((err) => {
          input.state.status = 'error'
          input.state.error = err
        }),
    }
  }

  if (input.state.status === 'pending') {
    throw input.state.promise
  }

  return input.state.value
}
