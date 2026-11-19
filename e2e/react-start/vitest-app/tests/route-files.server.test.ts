import { expect, test } from 'vitest'
import { Route as HealthRoute } from '../src/routes/api/health'
import { Route as PostRoute } from '../src/routes/posts.$postId'

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
