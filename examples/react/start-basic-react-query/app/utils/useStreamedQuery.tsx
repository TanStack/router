import {
  hashKey,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type {
  DefaultError,
  QueryClient,
  QueryKey,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'

export function useStreamedQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  _queryClient?: QueryClient,
): UseSuspenseQueryResult<TData, TError> {
  const router = useRouter()
  const ctxQueryClient = useQueryClient()
  const queryClient = _queryClient || ctxQueryClient

  // On the client, pick up the deferred data from the stream
  const initialData = router.getStreamedValue<any>(
    '__Query__' + hashKey(options.queryKey),
  )

  const query = useSuspenseQuery(
    {
      initialData,
      ...options,
    },
    queryClient,
  )

  // On the server, send down the resolved data to the stream
  if (typeof document === 'undefined') {
    router.streamValue('__Query__' + hashKey(options.queryKey), query.data)
  }

  return query
}
