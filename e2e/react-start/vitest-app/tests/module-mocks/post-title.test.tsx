// @vitest-environment jsdom

// A test that replaces a server function with a module mock (`vi.mock`).
// Start's compiler must leave this working: the
// module the mock replaces, the original that `importOriginal` loads, and the
// module that imports the mocked function. The project runs its tests in Node
// by default, and this file switches to jsdom with the comment above.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PostTitle } from '../../src/components/PostTitle'
import { fetchPost, likePost } from '../../src/posts'
import type { ReactNode } from 'react'

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

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

afterEach(cleanup)

test('a module mock answers the server function call of a query', async () => {
  renderWithClient(<PostTitle postId="42" />)

  expect(await screen.findByText('A mocked post')).toBeTruthy()
  expect(fetchPost).toHaveBeenCalledWith({ data: '42' })
})

test('the other exports of the mocked module are the client code of the app', () => {
  expect(vi.isMockFunction(likePost)).toBe(false)
  expect(likePost.url).toContain('/_serverFn/')
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
