// Mocks of `mockServerFn` in tests that run at the same time. The file runs in
// browser mode and in jsdom.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, within } from '@testing-library/react'
import { mockServerFn } from '@tanstack/react-start/testing'
import { afterAll, expect, test } from 'vitest'
import { PostTitle } from '../src/components/PostTitle'
import { fetchPost, fetchPostCount, likePost } from '../src/posts'

// jsdom runs in Node, which has the async context that tells concurrent tests
// apart. Browser mode has none.
const hasAsyncContext =
  typeof process !== 'undefined' && !!process.versions?.node

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function renderPostTitle(postId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PostTitle postId={postId} />
    </QueryClientProvider>,
  )
}

// (concurrent tests share one document: each one queries its own container)
afterAll(cleanup)

test.concurrent(
  'a mock of the test context answers the calls of its test',
  async ({ mockServerFn }) => {
    mockServerFn(fetchPost, ({ data }) => ({ id: data, title: 'From test 1' }))
    const view = renderPostTitle('1')

    expect(await within(view.container).findByText('From test 1')).toBeTruthy()
  },
)

// It starts before the next test, so without async context that test is the
// one that started last. The reset of the test context still removes only the
// mocks of its own test. (It mocks a server function that no other test of the
// file mocks: in browser mode another running test's mock of the same function
// would answer after the reset.)
test.concurrent(
  'a reset of the test context removes the mocks of its test only',
  async ({ mockServerFn, resetServerFnMocks }) => {
    mockServerFn(fetchPostCount, () => 3)
    await later(10)

    resetServerFnMocks()

    await expect(fetchPostCount()).rejects.toThrow('no server runs')
  },
)

// The test above ends while this one waits. Only its own mocks went with it.
test.concurrent(
  'a mock of the test context stays until its own test ends',
  async ({ mockServerFn }) => {
    mockServerFn(likePost, () => 7)
    await later(50)

    await expect(likePost({ data: '1' })).resolves.toBe(7)
  },
)

for (const [name, delay] of [
  ['A', 20],
  ['B', 0],
] as const) {
  test.skipIf(!hasAsyncContext)(
    `concurrent tests that mock the same server function each get their own answer (${name})`,
    { concurrent: true },
    async () => {
      mockServerFn(fetchPost, ({ data }) => ({
        id: data,
        title: `Post ${name}`,
      }))
      await later(delay)
      const view = renderPostTitle(name)

      expect(
        await within(view.container).findByText(`Post ${name}`),
      ).toBeTruthy()
    },
  )
}
