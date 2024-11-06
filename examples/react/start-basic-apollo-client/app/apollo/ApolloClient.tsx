import { ApolloClient as _ApolloClient } from '@apollo/client-react-streaming'
import { streamingLink } from './StreamLink'
import type { ApolloLink } from '@apollo/client/index.js'
import type { HookWrappers } from '@apollo/client/react/internal'
import type { StreamLinkEvent } from './StreamLink'
import { printMinified, serializeOptions } from '~/utils/transportedQueryRef'

const WRAPPERS = Symbol.for('apollo.hook.wrappers')

export class ApolloClient extends _ApolloClient {
  constructor(options: ConstructorParameters<typeof _ApolloClient>[0]) {
    super(options)
    this.setLink(this.link)

    const queryManager = this['queryManager'] as { [WRAPPERS]: HookWrappers }
    const origWrapper = queryManager[WRAPPERS].createQueryPreloader

    queryManager[WRAPPERS] = {
      ...queryManager[WRAPPERS],
      createQueryPreloader: (orig) => {
        const wrapped = origWrapper ? origWrapper(orig) : orig
        return (client) => {
          const origPreloader = wrapped(client)

          return (...[query, options]: Parameters<typeof origPreloader>) => {
            if (options && 'stream' in options) {
            }
            let __injectIntoStream:
              | ReadableStreamDefaultController<StreamLinkEvent>
              | undefined
            const __eventStream = new ReadableStream({
              start(controller) {
                __injectIntoStream = controller
              },
            })
            Object.assign(__eventStream, {
              JSONStream: true,
            })
            const result = origPreloader(query, {
              ...options,
              context: {
                ...options?.context,
                queryDeduplication: false,
                __injectIntoStream,
              },
            })

            Object.assign(result, {
              __apollo_queryRef: [
                printMinified(query),
                {
                  ...options,
                  context: { ...options?.context, __eventStream },
                },
              ],
            })

            return result
          }
        }
      },
    } satisfies HookWrappers
  }

  setLink(newLink: ApolloLink) {
    _ApolloClient.prototype.setLink.call(this, streamingLink.concat(newLink))
  }
}
