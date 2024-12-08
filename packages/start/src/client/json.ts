import type { JsonResponse } from './createServerFn'

export function json<TData>(
  payload: TData,
  init?: ResponseInit,
): JsonResponse<TData> {
  const headers = new Headers(init?.headers)

  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  })
}
