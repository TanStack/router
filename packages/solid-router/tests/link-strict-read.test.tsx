import * as Solid from 'solid-js'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

function renderLinks(Links: Solid.Component) {
  const strictReads: Array<string> = []
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    const message = String(args[0])
    if (message.includes('STRICT_READ_UNTRACKED')) {
      strictReads.push(message.split('\n')[0]!)
    }
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  disposers.push(history.destroy)
  const root = createRootRoute({
    component: () => (
      <>
        <Links />
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/about' }),
      createRoute({ getParentRoute: () => root, path: '/posts' }),
    ]),
    history,
    scrollRestoration: false,
  })
  render(() => <RouterProvider router={router} />)
  return strictReads
}

const items = [
  { label: 'About', linkOptions: { to: '/about' } },
  { label: 'Posts', linkOptions: { to: '/posts' } },
]

// https://github.com/TanStack/router/issues/8911
test('a Link spreading options from a For item reads no props untracked', async () => {
  const ref = vi.fn()
  const strictReads = renderLinks(() => (
    <Solid.For each={items}>
      {(item) => (
        <Link {...item.linkOptions} ref={ref}>
          {item.label}
        </Link>
      )}
    </Solid.For>
  ))

  expect(await screen.findByText('About')).toHaveAttribute('href', '/about')
  expect(screen.getByText('Posts')).toHaveAttribute('href', '/posts')
  expect(ref.mock.calls).toEqual([
    [screen.getByText('About')],
    [screen.getByText('Posts')],
  ])
  expect(strictReads).toEqual([])
})

test('a createLink component spreading options from a For item reads no props untracked', async () => {
  const Button = createLink((props: Solid.ComponentProps<'a'>) => (
    <a data-custom {...props} />
  ))
  const strictReads = renderLinks(() => (
    <Solid.For each={items}>
      {(item) => <Button {...(item.linkOptions as {})}>{item.label}</Button>}
    </Solid.For>
  ))

  const about = await screen.findByText('About')
  expect(about).toHaveAttribute('href', '/about')
  expect(about).toHaveAttribute('data-custom')
  expect(strictReads).toEqual([])
})

test('a Link follows the reactive object its options are spread from', async () => {
  const [item, setItem] = Solid.createSignal(items[0]!)
  const strictReads = renderLinks(() => (
    <Link {...item().linkOptions}>{item().label}</Link>
  ))

  expect(await screen.findByText('About')).toHaveAttribute('href', '/about')
  setItem(items[1]!)
  await waitFor(() =>
    expect(screen.getByText('Posts')).toHaveAttribute('href', '/posts'),
  )
  expect(strictReads).toEqual([])
})

test('the harness reports a prop read in a component body', async () => {
  const [label] = Solid.createSignal('About')
  const Untracked = (props: { label: string }) => {
    const text = props.label
    return <span>{text}</span>
  }
  const strictReads = renderLinks(() => <Untracked label={label()} />)

  await screen.findByText('About')
  expect(strictReads).toHaveLength(1)
})
