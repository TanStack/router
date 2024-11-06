// quickly copy-pasted over from https://github.com/apollographql/apollo-client-nextjs/blob/0269f55a37f13c128e64bb960980835e45b261d1/packages/client-react-streaming/src/transportedQueryRef.ts
// because this is not exported from the package yet

import {
  getSuspenseCache,
  wrapQueryRef,
} from '@apollo/client/react/internal/index.js'

import { gql } from '@apollo/client/index.js'
import { canonicalStringify } from '@apollo/client/cache/index.js'
import { print, stripIgnoredCharacters } from 'graphql'
import type {
  ApolloClient,
  FetchPolicy,
  QueryRef,
  WatchQueryOptions,
} from '@apollo/client/index.js'
import type { DocumentNode } from 'graphql'
import type { CacheKey } from '@apollo/client/react/internal/index.js'

export type TransportedOptions = { query: string } & Omit<
  WatchQueryOptions,
  'query'
>

export type RestrictedPreloadOptions = {
  fetchPolicy?: 'cache-first'
  returnPartialData?: false
  nextFetchPolicy?: undefined
  pollInterval?: undefined
}

export function printMinified(query: DocumentNode): string {
  return stripIgnoredCharacters(print(query))
}

function sanitizeForTransport<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T
}

export function serializeOptions<T extends WatchQueryOptions<any, any>>(
  options: T,
): { query: string; nextFetchPolicy?: FetchPolicy | undefined } & Omit<
  T,
  'query'
> {
  return {
    ...(options as typeof options & {
      // little bit of a hack around the method signature, but the method signature would cause React to error anyways
      nextFetchPolicy?: FetchPolicy | undefined
    }),
    query: printMinified(options.query),
  }
}

export function deserializeOptions(
  options: TransportedOptions,
): WatchQueryOptions {
  return {
    ...options,
    // `gql` memoizes results, but based on the input string.
    // We parse-stringify-parse here to ensure that our minified query
    // has the best chance of being the referential same query as the one used in
    // client-side code.
    query: gql(print(gql(options.query))),
  }
}

export type TransportedQueryRefOptions = TransportedOptions &
  RestrictedPreloadOptions

/**
 * A `TransportedQueryRef` is an opaque object accessible via renderProp within `PreloadQuery`.
 *
 * A child client component reading the `TransportedQueryRef` via useReadQuery will suspend until the promise resolves.
 *
 * @public
 */
export interface TransportedQueryRef<TData = unknown, TVariables = unknown>
  extends QueryRef<TData, TVariables> {
  /**
   * Temporarily disabled - see https://github.com/apollographql/apollo-client-nextjs/issues/332
   *
   * Will now be be `undefined` both in React Server Components and Client Components until we can find a better resolution.
   */
  toPromise?: undefined
}

export interface InternalTransportedQueryRef<
  TData = unknown,
  TVariables = unknown,
> extends TransportedQueryRef<TData, TVariables> {
  __transportedQueryRef: true | QueryRef<any, any>
  options: TransportedQueryRefOptions
  queryKey: string
}

export function createTransportedQueryRef<TData, TVariables>(
  options: TransportedQueryRefOptions,
  queryKey: string,
  _promise: Promise<any>,
): InternalTransportedQueryRef<TData, TVariables> {
  const ref: InternalTransportedQueryRef<TData, TVariables> = {
    __transportedQueryRef: true,
    options,
    queryKey,
  }
  /*
  Temporarily disabled - see https://github.com/apollographql/apollo-client-nextjs/issues/332
  This causes a dev-mode warning:
      Warning: Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.
      <... queryRef={{__transportedQueryRef: true, options: ..., queryKey: ...}}>
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  */
  // Object.defineProperty(ref, "toPromise", {
  //   value: () => promise.then(() => ref),
  //   enumerable: false,
  // });
  return ref
}

export function reviveTransportedQueryRef(
  queryRef: InternalTransportedQueryRef,
  client: ApolloClient<any>,
): [QueryRef<any, any>, CacheKey] {
  const hydratedOptions = deserializeOptions(queryRef.options)
  const cacheKey: CacheKey = [
    hydratedOptions.query,
    canonicalStringify(hydratedOptions.variables),
    queryRef.queryKey,
  ]
  if (queryRef.__transportedQueryRef === true) {
    queryRef.__transportedQueryRef = wrapQueryRef(
      getSuspenseCache(client).getQueryRef(cacheKey, () =>
        client.watchQuery(hydratedOptions),
      ),
    )
  }
  return [queryRef.__transportedQueryRef, cacheKey]
}

function isTransportedQueryRef(
  queryRef: object,
): queryRef is InternalTransportedQueryRef {
  return '__transportedQueryRef' in queryRef
}
