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

export function cloneHeaders(headers: Headers): Headers {
  const cloned = new Headers()
  // Headers iteration combines repeated header values into one comma-joined
  // value, so `set` carries multi-value headers (Link, Vary, ...) losslessly.
  // Set-Cookie is the one header where comma-joining is unsafe (cookie
  // attributes like Expires contain commas), so it is copied value-by-value.
  for (const [name, value] of headers) {
    if (name !== 'set-cookie') {
      cloned.set(name, value)
    }
  }
  for (const cookie of getSetCookieValues(headers)) {
    cloned.append('set-cookie', cookie)
  }
  return cloned
}
