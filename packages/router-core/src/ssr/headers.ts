import { splitSetCookieString } from 'cookie-es'
import type { OutgoingHttpHeaders } from 'node:http2'

// A utility function to turn HeadersInit into an object
export function headersInitToObject(
  headers: HeadersInit,
): Record<keyof OutgoingHttpHeaders, string> {
  const obj: Record<keyof OutgoingHttpHeaders, string> = {}
  const headersInstance = new Headers(headers)
  for (const [key, value] of headersInstance.entries()) {
    obj[key] = value
  }
  return obj
}

type AnyHeaders =
  | Headers
  | HeadersInit
  | Record<string, string>
  | Array<[string, string]>
  | OutgoingHttpHeaders
  | undefined

// Helper function to convert various HeaderInit types to a Headers instance
function toHeadersInstance(init: AnyHeaders) {
  if (init instanceof Headers) {
    return new Headers(init)
  } else if (Array.isArray(init)) {
    return new Headers(init)
  } else if (typeof init === 'object') {
    return new Headers(init as HeadersInit)
  } else {
    return new Headers()
  }
}

// Function to merge headers with proper overrides
export function mergeHeaders(...headers: Array<AnyHeaders>) {
  return headers.reduce((acc: Headers, header) => {
    const headersInstance = toHeadersInstance(header)
    for (const [key, value] of headersInstance.entries()) {
      if (key === 'set-cookie') {
        const splitCookies = splitSetCookieString(value)
        splitCookies.forEach((cookie) => acc.append('set-cookie', cookie))
      } else {
        acc.set(key, value)
      }
    }
    return acc
  }, new Headers())
}
