import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getResponseHeaders } from '@tanstack/react-start/server'

// https://tanstack.com/start/latest/docs/framework/react/guide/isr##using-middleware-for-cache-headers
export const cacheMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  // @ts-expect-error - headers is not typed, but they are present.
  result.headers.set('Cache-Control', 'b')

  return result
})

const data = [
  { id: 1, name: 'Teenage Dirtbag', artist: 'Wheatus' },
  { id: 2, name: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { id: 3, name: 'The Middle', artist: 'Jimmy Eat World' },
  { id: 4, name: 'My Own Worst Enemy', artist: 'Lit' },
  { id: 5, name: 'Fat Lip', artist: 'Sum 41' },
  { id: 6, name: 'All the Small Things', artist: 'blink-182' },
  { id: 7, name: 'Beverly Hills', artist: 'Weezer' },
]
export const getPunkSongs = createServerFn({
  method: 'GET',
})
  .middleware([cacheMiddleware])
  .handler(async () => {
    const headers = getResponseHeaders()
    headers.set('Cache-Control', 'a')
    return data
  })
