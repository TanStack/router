import { runInRequest } from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { Route as HealthRoute } from '../src/routes/api/health'
import { Route as PostRoute } from '../src/routes/posts.$postId'
import { Route as VisitsRoute } from '../src/routes/visits'

test('the options that only the server uses are in server code', () => {
  expect(Object.keys(PostRoute.options).sort()).toEqual([
    'component',
    'headers',
    'loader',
    'server',
    'ssr',
  ])
})

test('a server route handler can be called', async () => {
  const { handlers } = (HealthRoute.options as any).server
  const response: Response = await handlers.GET({
    request: new Request('http://localhost/api/health'),
  })

  expect(await response.json()).toEqual({
    ok: true,
    secret: 'the server secret',
  })
})

// The route file declares a server function. In a test run the file is one
// module, so its loader reads the state that the handler wrote.
test('the loader of a route reads the state that a server function of its file wrote', async () => {
  const { loader } = VisitsRoute.options as any

  await expect(runInRequest(() => loader())).resolves.toEqual({
    count: 1,
    pages: ['/visits'],
  })
})
