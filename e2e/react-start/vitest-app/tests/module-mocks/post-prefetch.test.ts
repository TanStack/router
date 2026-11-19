// The server-side counterpart of post-title.test.tsx: a test in Node replaces
// a server function with a module mock, and server code that prefetches the
// query gets the mock's answer.
import { QueryClient } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'
import { postQueryOptions } from '../../src/post-query-options'
import { fetchPost } from '../../src/posts'

vi.mock('../../src/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/posts')>()
  return {
    ...actual,
    fetchPost: vi.fn(async ({ data }: { data: string }) => ({
      id: data,
      title: 'A mocked post',
    })),
  }
})

test('a module mock answers the server function call of a prefetch', async () => {
  const queryClient = new QueryClient()

  const post = await queryClient.fetchQuery(postQueryOptions('42'))

  expect(post).toEqual({ id: '42', title: 'A mocked post' })
  expect(fetchPost).toHaveBeenCalledWith({ data: '42' })
})
