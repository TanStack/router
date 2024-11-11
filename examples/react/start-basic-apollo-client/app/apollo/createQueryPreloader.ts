import { createQueryPreloader, gql } from '@apollo/client/index.js'
import { print, stripIgnoredCharacters } from 'graphql'
import {
  readFromReadableStream,
  skipDataTransport,
  teeToReadableStream,
} from '@apollo/client-react-streaming'
import type { ReadableStreamLinkEvent } from '@apollo/client-react-streaming'
import type { ApolloClient } from './ApolloClient'
import type {
  DocumentNode,
  PreloadQueryFunction,
  QueryRef,
  WatchQueryOptions,
} from '@apollo/client/index.js'

export function createTransportedQueryPreloader(
  client: ApolloClient,
): PreloadQueryFunction {
  return (...[query, options]: Parameters<PreloadQueryFunction>) => {
    let __injectIntoStream:
      | ReadableStreamDefaultController<ReadableStreamLinkEvent>
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
      context: skipDataTransport(
        teeToReadableStream(__injectIntoStream!, {
          ...options?.context,
          // we want to do this even if the query is already running for another reason
          queryDeduplication: false,
        }),
      ),
    })

    return createTransportedQueryRef(
      {
        ...(options as any),
        query: printMinified(query),
      },
      __eventStream,
    ) as any
  }
}

function printMinified(query: DocumentNode): string {
  return stripIgnoredCharacters(print(query))
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
  stream: ReadableStream<ReadableStreamLinkEvent>,
): InternalTransportedQueryRef<TData, TVariables> {
  const encodeStream = new TransformStream<ReadableStreamLinkEvent, string>({
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

export const ensureHydrated = (
  queryRef: QueryRef<any, unknown>,
  apolloClient: ApolloClient,
) => {
  if (isTransportedQueryRef(queryRef)) {
    if (!queryRef._hydrated) {
      queryRef._hydrated = reviveTransportedQueryRef(queryRef, apolloClient)
    }
    return queryRef._hydrated
  }
  return queryRef
}

export function reviveTransportedQueryRef(
  { $__apollo_queryRef: { options, stream } }: InternalTransportedQueryRef,
  apolloClient: ApolloClient,
) {
  const decodeStream = new TransformStream<string, ReadableStreamLinkEvent>({
    transform(chunk, controller) {
      if (typeof chunk !== 'string') {
        chunk = new TextDecoder().decode(chunk)
      }
      controller.enqueue(JSON.parse(chunk))
    },
  })

  const { query: queryString, ...optionsRest } = options
  const query = gql(queryString)
  return createQueryPreloader(apolloClient)(query, {
    ...optionsRest,
    fetchPolicy: 'network-only',
    context: skipDataTransport(
      readFromReadableStream(stream.pipeThrough(decodeStream), {
        ...optionsRest.context,
        queryDeduplication: true,
      }),
    ),
  })
}
