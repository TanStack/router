# Environment Functions

Server-side environment utilities.

## getRequestHeader

```tsx
import { createServerFn } from '@tanstack/start'
import { getRequestHeader } from 'vinxi/http'

const getLocale = createServerFn().handler(async () => {
  const acceptLanguage = getRequestHeader('accept-language')
  const userAgent = getRequestHeader('user-agent')

  return {
    locale: parseLocale(acceptLanguage),
    isMobile: /mobile/i.test(userAgent || ''),
  }
})
```

## setResponseHeader

```tsx
import { setResponseHeader } from 'vinxi/http'

const getCachedData = createServerFn().handler(async () => {
  setResponseHeader('Cache-Control', 'public, max-age=3600')
  setResponseHeader('X-Custom-Header', 'value')

  return fetchData()
})
```

## Cookies

```tsx
import { getCookie, setCookie, deleteCookie } from 'vinxi/http'

const getTheme = createServerFn().handler(async () => {
  return getCookie('theme') || 'light'
})

const setTheme = createServerFn({ method: 'POST' })
  .validator(z.object({ theme: z.enum(['light', 'dark']) }))
  .handler(async ({ data }) => {
    setCookie('theme', data.theme, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
  })

const clearTheme = createServerFn({ method: 'POST' }).handler(async () => {
  deleteCookie('theme')
})
```

## Request Object

```tsx
import { getRequest, getRequestURL } from 'vinxi/http'

const logRequest = createServerFn().handler(async () => {
  const request = getRequest()
  const url = getRequestURL()

  console.log({
    method: request.method,
    url: url.href,
    pathname: url.pathname,
    search: url.search,
  })
})
```

## Response Status

```tsx
import { setResponseStatus } from 'vinxi/http'

const maybeNotFound = createServerFn().handler(async ({ data }) => {
  const item = await db.find(data.id)

  if (!item) {
    setResponseStatus(404)
    return { error: 'Not found' }
  }

  return item
})
```

## IP Address

```tsx
import { getRequestIP } from 'vinxi/http'

const rateLimit = createServerFn().handler(async () => {
  const ip = getRequestIP()
  const requests = await redis.incr(`rate:${ip}`)

  if (requests > 100) {
    setResponseStatus(429)
    return { error: 'Too many requests' }
  }
})
```
