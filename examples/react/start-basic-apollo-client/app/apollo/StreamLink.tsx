import { ApolloLink, Observable } from '@apollo/client/index.js'
import type { FetchResult } from '@apollo/client/index.js'

export type StreamLinkEvent =
  | { type: 'next'; value: FetchResult }
  | { type: 'completed' }
  | { type: 'error' }

export const streamingLink = new ApolloLink((operation, forward) => {
  const context = operation.getContext()

  const injectIntoStream = context.__injectIntoStream as
    | undefined
    | ReadableStreamDefaultController<StreamLinkEvent>

  if (injectIntoStream) {
    return new Observable((observer) => {
      console.log('reportStream subscribed')
      const subscription = forward(operation).subscribe({
        next: (result) => {
          injectIntoStream.enqueue({ type: 'next', value: result })
          observer.next(result)
        },
        error: (error) => {
          injectIntoStream.enqueue({ type: 'error' })
          injectIntoStream.close()
          observer.error(error)
        },
        complete: () => {
          injectIntoStream.enqueue({ type: 'completed' })
          injectIntoStream.close()
          observer.complete()
        },
      })

      return () => {
        subscription.unsubscribe()
      }
    })
  }

  const eventSteam = context.__eventStream as
    | ReadableStream<StreamLinkEvent>
    | undefined
  if (eventSteam) {
    return new Observable((observer) => {
      let aborted = false
      const reader = eventSteam.getReader()
      consumeReader()

      return () => {
        aborted = true
        reader.cancel()
      }

      async function consumeReader() {
        let event: ReadableStreamReadResult<StreamLinkEvent> | undefined =
          undefined
        while (!aborted && !event?.done) {
          event = await reader.read()
          if (aborted as boolean) break
          if (event.value) {
            switch (event.value.type) {
              case 'next':
                observer.next(event.value.value)
                break
              case 'completed':
                observer.complete()
                break
              case 'error':
                observer.error(
                  new Error(
                    'Error from event stream. Redacted for security concerns.',
                  ),
                )
                break
            }
          }
        }
      }
    })
  }

  return forward(operation)
})
