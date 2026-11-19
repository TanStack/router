import { fromJSON } from 'seroval'
import {
  createSolidServerFunctionGetRequest,
  createSolidServerFunctionPostRequest,
  solidServerFunctionFormatHeader,
} from '../../../../solid-server-functions'
import type { ServerFnBenchAdapter } from '../bench'
import type { SerovalJSON } from 'seroval'

function decodePayload(body: string) {
  return fromJSON(JSON.parse(body) as SerovalJSON, {}) as Record<
    string,
    unknown
  >
}

function buildGetRequest(url: string, query: string, index: number) {
  const body = new URLSearchParams(query).get('payload')
  if (!body) {
    throw new Error('Solid server function GET fixture is missing its payload')
  }

  return createSolidServerFunctionGetRequest(
    url,
    [{ ...decodePayload(body), method: 'GET' }],
    `ssr-get:${index}`,
  )
}

function buildPostRequest(url: string, body: string, index: number) {
  return createSolidServerFunctionPostRequest(
    url,
    [{ ...decodePayload(body), method: 'POST' }],
    `ssr-post:${index}`,
  )
}

export const solidServerFnBenchAdapter: ServerFnBenchAdapter = {
  responseHeader: solidServerFunctionFormatHeader,
  decodeResponse: (json) => json,
  buildGetRequest,
  buildPostRequest,
}
