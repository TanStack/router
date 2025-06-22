import { mergeHeaders } from './headers'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

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
