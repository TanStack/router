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
  applyHeaders(headers, cloned)
  return cloned
}

export function applyHeaders(source: Headers, target: Headers): void {
  for (const [name, value] of source) {
    if (name !== 'set-cookie') {
      target.set(name, value)
    }
  }
  for (const cookie of getSetCookieValues(source)) {
    target.append('set-cookie', cookie)
  }
}

export function copyHeaders(source: Headers, target: Headers): void {
  for (const name of Array.from(target.keys())) {
    target.delete(name)
  }
  applyHeaders(source, target)
}
