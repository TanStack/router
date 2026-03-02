# Server Function Context

Access request context in server functions.

## Request Headers

```tsx
import { createServerFn } from '@tanstack/start'
import { getRequestHeader } from 'vinxi/http'

const getLocale = createServerFn().handler(async () => {
  const acceptLanguage = getRequestHeader('accept-language')
  return { locale: parseLocale(acceptLanguage) }
})
```

## Cookies

```tsx
import { getCookie, setCookie } from 'vinxi/http'

const getTheme = createServerFn().handler(async () => {
  const theme = getCookie('theme') || 'light'
  return { theme }
})

const setTheme = createServerFn({ method: 'POST' })
  .validator(z.object({ theme: z.enum(['light', 'dark']) }))
  .handler(async ({ data }) => {
    setCookie('theme', data.theme, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
    return { success: true }
  })
```

## Full Request Object

```tsx
import { getRequest } from 'vinxi/http'

const logRequest = createServerFn().handler(async () => {
  const request = getRequest()

  console.log({
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
  })

  return { logged: true }
})
```

## Response Headers

```tsx
import { setResponseHeader, setResponseStatus } from 'vinxi/http'

const customResponse = createServerFn().handler(async () => {
  setResponseHeader('X-Custom-Header', 'value')
  setResponseHeader('Cache-Control', 'max-age=3600')

  return { data: 'with custom headers' }
})

const notFoundExample = createServerFn().handler(async () => {
  setResponseStatus(404)
  return { error: 'Not found' }
})
```

## IP Address

```tsx
import { getRequestIP } from 'vinxi/http'

const logVisitor = createServerFn().handler(async () => {
  const ip = getRequestIP()
  await analytics.logVisit(ip)
  return { success: true }
})
```
