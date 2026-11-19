import { fromJSON } from 'seroval'
import {
  createSolidServerFunctionPostRequest,
  solidServerFunctionFormatHeader,
} from '../../../../solid-server-functions'
import type { GlobalMiddlewareBenchAdapter } from '../bench'
import type { SerovalJSON } from 'seroval'

function buildPostRequest(url: string, body: string, index: number) {
  const payload = fromJSON(JSON.parse(body) as SerovalJSON, {}) as Record<
    string,
    unknown
  >

  return createSolidServerFunctionPostRequest(
    url,
    [{ ...payload, method: 'POST' }],
    `global-middleware:${index}`,
  )
}

export const solidGlobalMiddlewareBenchAdapter: GlobalMiddlewareBenchAdapter = {
  responseHeader: solidServerFunctionFormatHeader,
  buildPostRequest,
}
