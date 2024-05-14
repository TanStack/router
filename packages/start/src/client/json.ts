import { serverFnReturnTypeHeader } from '../constants'
import type { JsonResponse } from './createServerFn'

export function json<TData>(
  payload: TData,
  opts?: {
    status?: number
    statusText?: string
    headers?: HeadersInit
  },
): JsonResponse<TData> {
  const status = opts?.status || 200
  const statusText = opts?.statusText

  return new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      [serverFnReturnTypeHeader]: 'json',
      ...opts?.headers,
    },
  })
}
