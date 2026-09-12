import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('a parent re-render with equal props does not re-render the Link', async () => {
  let hostRenders = 0
  const Host = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
    (props, ref) => {
      hostRenders++
      return <a {...props} ref={ref} />
    },
  )
  const CustomLink = createLink(Host)
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/posts/$postId' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
  })
  await router.load()

  let rerender = () => {}
  let setPostId: React.Dispatch<React.SetStateAction<number>> = () => {}
  function Parent() {
    const [, setTick] = React.useState(0)
    const [postId, set] = React.useState(1)
    rerender = () => setTick((tick) => tick + 1)
    setPostId = set
    return (
      <RouterContextProvider router={router}>
        <CustomLink
          to="/posts/$postId"
          params={{ postId: String(postId) }}
          activeProps={{ className: 'current' }}
          preload={false}
        >
          Post
        </CustomLink>
      </RouterContextProvider>
    )
  }
  const view = render(<Parent />)
  const anchor = view.getByText('Post')
  expect(anchor).toHaveAttribute('href', '/posts/1')
  expect(anchor).toHaveClass('current')
  const rendersAfterMount = hostRenders

  // Same props, new inline objects: the memoized Link is skipped.
  act(() => rerender())
  expect(hostRenders).toBe(rendersAfterMount)

  // A changed destination renders again.
  act(() => setPostId(2))
  expect(hostRenders).toBe(rendersAfterMount + 1)
  expect(anchor).toHaveAttribute('href', '/posts/2')
  expect(anchor).not.toHaveClass('current')
})
