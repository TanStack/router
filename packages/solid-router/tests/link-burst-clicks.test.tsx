import * as Solid from 'solid-js'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => cleanup())
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

test('burst clicks accumulate while a transition holds the page', async () => {
  const root = createRootRoute()
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: (s: Record<string, unknown>) => ({ n: Number(s.n ?? 1) }),
    component: () => {
      const search = index.useSearch()
      const double = Solid.createMemo(async () => {
        const n = search().n
        await tick(100)
        return n * 2
      })
      return (
        <>
          <Link
            data-testid="inc"
            from="/"
            search={(s: any) => ({ n: s.n + 1 })}
          >
            inc
          </Link>
          <Solid.Loading fallback="Loading...">
            <div data-testid="n">
              n: {String(search().n)} d: {String(double())}
            </div>
          </Solid.Loading>
        </>
      )
    },
  })
  const router: any = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByTestId('inc')
  await tick(300)
  link.click()
  await tick(300)
  expect(screen.getByTestId('n').textContent).toBe('n: 2 d: 4')
  link.click()
  link.click()
  await tick(600)
  expect(screen.getByTestId('n').textContent).toBe('n: 4 d: 8')
  link.click()
  link.click()
  link.click()
  await tick(600)
  expect(screen.getByTestId('n').textContent).toBe('n: 7 d: 14')
})
