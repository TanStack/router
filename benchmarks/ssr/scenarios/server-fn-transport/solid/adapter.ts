import { fromJSON } from 'seroval'
import { decodeResponse } from '@solidjs/web/server-functions/client'
import {
  createSolidServerFunctionFormDataRequest,
  createSolidServerFunctionGetRequest,
  solidServerFunctionFormatHeader,
  validateSolidServerFunctionResponse,
} from '../../../../solid-server-functions'
import type {
  MultipartPayload,
  QueryPayload,
  ServerFnTransportBenchAdapter,
} from '../bench'
import type { SerovalJSON } from 'seroval'

const streamChunkCount = 8
const streamChunkSize = 1024

function decodePayload(query: string) {
  const body = new URLSearchParams(query).get('payload')
  if (!body) {
    throw new Error('Solid server function GET fixture is missing its payload')
  }

  return fromJSON(JSON.parse(body) as SerovalJSON, {}) as Record<
    string,
    unknown
  >
}

function buildMultipartRequest(
  url: string,
  payload: MultipartPayload,
  index: number,
) {
  return createSolidServerFunctionFormDataRequest(
    url,
    [{ method: 'POST' }],
    payload.body,
    payload.contentType,
    `transport-form:${index}`,
  )
}

function buildGetRequest(url: string, payload: QueryPayload, index: number) {
  return createSolidServerFunctionGetRequest(
    url,
    [{ ...decodePayload(payload.query), method: 'GET' }],
    `transport-get:${index}`,
  )
}

async function assertRawResponse(response: Response, expectedBody: string) {
  validateSolidServerFunctionResponse(
    response,
    new Request('http://localhost/_serverFn/'),
  )
  const decoded = (await decodeResponse(response)) as {
    result?: unknown
  }

  if (!(decoded.result instanceof Response)) {
    throw new Error('raw-response sanity check expected a Response result')
  }

  const body = await decoded.result.text()
  if (body !== expectedBody) {
    throw new Error(
      `raw-response sanity check expected ${expectedBody}, received ${body}`,
    )
  }
}

async function assertRawStream(response: Response, expectedLabel: string) {
  validateSolidServerFunctionResponse(
    response,
    new Request('http://localhost/_serverFn/'),
  )
  const decoded = (await decodeResponse(response)) as {
    result?: {
      label?: string
      data?: ReadableStream<Uint8Array>
    }
  }
  const result = decoded.result

  if (result?.label !== expectedLabel) {
    throw new Error(
      `raw-stream sanity check expected label ${expectedLabel}, received ${result?.label}`,
    )
  }

  if (!(result.data instanceof ReadableStream)) {
    throw new Error('raw-stream sanity check expected a ReadableStream')
  }

  const reader = result.data.getReader()
  let chunks = 0
  let bytes = 0

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    chunks++
    bytes += chunk.value.byteLength
  }

  const expectedBytes = streamChunkCount * streamChunkSize
  if (chunks !== streamChunkCount || bytes !== expectedBytes) {
    throw new Error(
      `raw-stream sanity check expected ${streamChunkCount} chunks and ${expectedBytes} bytes, received ${chunks} chunks and ${bytes} bytes`,
    )
  }
}

export const solidServerFnTransportBenchAdapter: ServerFnTransportBenchAdapter =
  {
    responseHeader: solidServerFunctionFormatHeader,
    buildMultipartRequest,
    buildGetRequest,
    assertRawResponse,
    assertRawStream,
    validateSerializedResponse: validateSolidServerFunctionResponse,
    validateRawResponse: validateSolidServerFunctionResponse,
    validateRawStreamResponse: validateSolidServerFunctionResponse,
  }
