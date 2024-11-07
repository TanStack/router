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
import type { HookWrappers, QueryRef } from '@apollo/client/react/internal'
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

function id<T>(x: T): T {
  return x
}

const WRAPPERS = Symbol.for('apollo.hook.wrappers')

export class ApolloClient extends _ApolloClient {
  constructor(options: ConstructorParameters<typeof _ApolloClient>[0]) {
    super(options)
    this.setLink(this.link)

    const queryManager = this['queryManager'] as { [WRAPPERS]: HookWrappers }

    const origWrappers = { ...queryManager[WRAPPERS] }

    const ensureHydrated = (queryRef: QueryRef<any, unknown>) => {
      if (isTransportedQueryRef(queryRef)) {
        if (!queryRef._hydrated) {
          queryRef._hydrated = createQueryPreloader(this).revive(queryRef)
        }
        return queryRef._hydrated
      }
      return queryRef
    }

    queryManager[WRAPPERS] = {
      ...origWrappers,
      useReadQuery: (originalHook) => (queryRef) => {
        return (origWrappers.useReadQuery || id)(originalHook)(
          ensureHydrated(queryRef),
        )
      },
      useQueryRefHandlers: (originalHook) => (queryRef) => {
        return (origWrappers.useQueryRefHandlers || id)(originalHook)<any, any>(
          ensureHydrated(queryRef),
        )
      },
      createQueryPreloader: (orig) => {
        return (client) => {
          const realPreloader = orig(client)
          return Object.assign(
            (...[query, options]: Parameters<PreloadQueryFunction>) => {
              let __injectIntoStream:
                | ReadableStreamDefaultController<StreamLinkEvent>
                | undefined
              const __eventStream = new ReadableStream({
                start(controller) {
                  __injectIntoStream = controller
                },
              })

              // Instead of creating the queryRef, we kick off a query that will feed the network response
              // into our custom event stream.
              client.query({
                query,
                ...options,
                // ensure that this query makes it to the network
                fetchPolicy: 'network-only',
                context: {
                  ...options?.context,
                  // we want to do this even if the query is already running for another reason
                  queryDeduplication: false,
                  // this will cause the StreamLink to duplicate events into our custom event stream
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
                reviveTransportedQueryRef(ref, realPreloader),
            },
          )
        }
      },
    } satisfies HookWrappers
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
