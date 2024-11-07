import { ApolloClient as _ApolloClient } from '@apollo/client-react-streaming'
import { createQueryPreloader, gql } from '@apollo/client/index.js'
import { print, stripIgnoredCharacters } from 'graphql'
import { streamingLink } from './StreamLink'
import type {
  ApolloLink,
  DocumentNode,
  PreloadQueryFunction,
  WatchQueryOptions,
} from '@apollo/client/index.js'
import type {
  HookWrappers as HookWrappers2,
  QueryRef,
} from '@apollo/client/react/internal'
import type { StreamLinkEvent } from './StreamLink'

declare module '@apollo/client/index.js' {
  export interface PreloadQueryFunction {
    revive: (
      ref: InternalTransportedQueryRef,
    ) => ReturnType<PreloadQueryFunction>
  }
}

function printMinified(query: DocumentNode): string {
  return stripIgnoredCharacters(print(query))
}

const WRAPPERS = Symbol.for('apollo.hook.wrappers')

export class ApolloClient extends _ApolloClient {
  constructor(options: ConstructorParameters<typeof _ApolloClient>[0]) {
    super(options)
    this.setLink(this.link)

    const queryManager = this['queryManager'] as { [WRAPPERS]: HookWrappers2 }
    const apolloClient = this

    queryManager[WRAPPERS] = {
      ...queryManager[WRAPPERS],
      useReadQuery: (originalHook) => (queryRef: QueryRef<any, unknown>) => {
        if (isTransportedQueryRef(queryRef)) {
          if (!queryRef._hydrated) {
            queryRef._hydrated =
              createQueryPreloader(apolloClient).revive(queryRef)
          }
          queryRef = queryRef._hydrated
        }
        return originalHook(queryRef)
      },
      createQueryPreloader: (orig) => {
        return (client) => {
          return Object.assign(
            (...[query, options]: Parameters<PreloadQueryFunction>) => {
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
              client.query({
                query,
                ...options,
                fetchPolicy: 'no-cache',
                context: {
                  ...options?.context,
                  queryDeduplication: false,
                  __injectIntoStream,
                },
              })

              return createTransportedQueryRef(
                {
                  ...(options as any),
                  query: printMinified(query),
                },
                __eventStream,
              ) as any
            },
            {
              revive: (ref: InternalTransportedQueryRef) =>
                reviveTransportedQueryRef(ref, orig(client)),
            },
          )
        }
      },
    } satisfies HookWrappers2
  }

  setLink(newLink: ApolloLink) {
    _ApolloClient.prototype.setLink.call(this, streamingLink.concat(newLink))
  }
}

type TransportedQueryRefOptions = { query: string } & Omit<
  WatchQueryOptions,
  'query'
> & {
    fetchPolicy?: 'cache-first'
    returnPartialData?: false
    nextFetchPolicy?: undefined
    pollInterval?: undefined
  }

export interface InternalTransportedQueryRef<
  // eslint-disable-next-line unused-imports/no-unused-vars
  TData = unknown,
  // eslint-disable-next-line unused-imports/no-unused-vars
  TVariables = unknown,
> {
  $__apollo_queryRef: {
    options: TransportedQueryRefOptions
    stream: ReadableStream<string>
  }
  _hydrated?: ReturnType<PreloadQueryFunction>
}

export function isTransportedQueryRef(
  val: any,
): val is InternalTransportedQueryRef<unknown, unknown> {
  return val && val.$__apollo_queryRef
}

export function createTransportedQueryRef<TData, TVariables>(
  options: TransportedQueryRefOptions,
  stream: ReadableStream<StreamLinkEvent>,
): InternalTransportedQueryRef<TData, TVariables> {
  const encodeStream = new TransformStream<StreamLinkEvent, string>({
    transform(chunk, controller) {
      controller.enqueue(JSON.stringify(chunk))
    },
  })

  return {
    $__apollo_queryRef: {
      options,
      stream: stream.pipeThrough(encodeStream),
    },
  }
}

function reviveTransportedQueryRef(
  { $__apollo_queryRef: { options, stream } }: InternalTransportedQueryRef,
  realPreloader: PreloadQueryFunction,
) {
  const decodeStream = new TransformStream<string, StreamLinkEvent>({
    transform(chunk, controller) {
      if (typeof chunk !== 'string') {
        chunk = new TextDecoder().decode(chunk)
      }
      controller.enqueue(JSON.parse(chunk))
    },
  })

  const { query: queryString, ...optionsRest } = options
  const query = gql(queryString)
  return realPreloader(query, {
    ...optionsRest,
    fetchPolicy: 'network-only',
    context: {
      ...optionsRest.context,
      queryDeduplication: true,
      __eventStream: stream.pipeThrough(decodeStream),
    },
  })
}
