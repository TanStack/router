import { splitSetCookieString } from 'cookie-es'

type HeadersWithGetSetCookie = Headers & {
  getSetCookie?: () => Array<string>
}

export function getSetCookieValues(headers: Headers): Array<string> {
  const headersWithSetCookie = headers as HeadersWithGetSetCookie
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie()
  }
  const value = headers.get('set-cookie')
  return value ? splitSetCookieString(value) : []
}
