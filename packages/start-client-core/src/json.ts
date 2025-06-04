import { mergeHeaders } from './headers'
import type { JsonResponse } from './createServerFn'

export function json<TData>(
  payload: TData,
  init?: ResponseInit,
): JsonResponse<TData> {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: mergeHeaders(
      { 'content-type': 'application/json' },
      init?.headers,
    ),
  })
}
