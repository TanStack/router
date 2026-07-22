import { encode, hasKeys } from '@tanstack/router-core'
import { toJSONAsync } from 'seroval'
import { getDefaultSerovalPlugins } from '../getDefaultSerovalPlugins'

type ServerFnUrlPayloadOptions = {
  data?: any
  context?: any
}

export async function buildServerFnUrlFromBase(
  url: string,
  opts?: ServerFnUrlPayloadOptions,
): Promise<string> {
  if (typeof FormData !== 'undefined' && opts?.data instanceof FormData) {
    throw new Error('FormData is not supported with GET requests')
  }

  const serializedPayload = await serializeServerFnPayload(opts)
  if (serializedPayload === undefined) {
    return url
  }

  const encodedPayload = encode({
    payload: serializedPayload,
  })

  return url.includes('?')
    ? `${url}&${encodedPayload}`
    : `${url}?${encodedPayload}`
}

export async function serializeServerFnPayload(
  opts?: ServerFnUrlPayloadOptions,
): Promise<string | undefined> {
  let payloadAvailable = false
  const payloadToSerialize: any = {}
  if (opts?.data !== undefined) {
    payloadAvailable = true
    payloadToSerialize['data'] = opts.data
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (opts?.context && hasKeys(opts.context)) {
    payloadAvailable = true
    payloadToSerialize['context'] = opts.context
  }

  if (payloadAvailable) {
    return serializeServerFnPayloadValue(payloadToSerialize)
  }
  return undefined
}

export async function serializeServerFnPayloadValue(data: any) {
  return JSON.stringify(
    await Promise.resolve(
      toJSONAsync(data, { plugins: getDefaultSerovalPlugins() }),
    ),
  )
}
