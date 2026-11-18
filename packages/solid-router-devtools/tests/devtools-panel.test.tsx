import { afterEach, expect, test, vi } from 'vitest'
import { render } from '@solidjs/web'
import {
  TanStackRouterDevtoolsCore,
  TanStackRouterDevtoolsPanelCore,
} from '@tanstack/router-devtools-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
import { createSignal, flush } from 'solid-js'
import { TanStackRouterDevtools } from '../src/TanStackRouterDevtools'
import { TanStackRouterDevtoolsPanel } from '../src/TanStackRouterDevtoolsPanel'
import type { Component } from 'solid-js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function setup(Devtools: Component) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <Devtools />
      </>
    ),
  })
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <p>Home</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <p>About</p>,
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const container = document.createElement('div')
  document.body.append(container)
  const dispose = render(() => <RouterProvider router={router} />, container)

  const shownPathname = () =>
    Array.from(container.querySelectorAll('span'))
      .find((span) => span.textContent === 'Pathname')
      ?.parentElement?.nextElementSibling?.querySelector('code')?.textContent

  return { router, dispose, shownPathname }
}

const wrappers = [
  {
    name: 'TanStackRouterDevtools',
    Devtools: () => <TanStackRouterDevtools initialIsOpen />,
    Core: TanStackRouterDevtoolsCore,
  },
  {
    name: 'TanStackRouterDevtoolsPanel',
    Devtools: () => <TanStackRouterDevtoolsPanel />,
    Core: TanStackRouterDevtoolsPanelCore,
  },
]

for (const { name, Devtools, Core } of wrappers) {
  test(`${name} shows the router state after a navigation`, async () => {
    const { router, shownPathname } = setup(Devtools)
    await vi.waitFor(() => expect(shownPathname()).toBe('/'), {
      timeout: 15_000,
    })

    await router.navigate({ to: '/about' })

    await vi.waitFor(() => expect(shownPathname()).toBe('/about'))
  }, 20_000)

  test(`${name} unmounts the devtools when it is disposed`, async () => {
    const unmount = vi.spyOn(Core.prototype, 'unmount')
    const { dispose, shownPathname } = setup(Devtools)
    await vi.waitFor(() => expect(shownPathname()).toBe('/'), {
      timeout: 15_000,
    })

    dispose()

    expect(unmount).toHaveBeenCalledTimes(1)
  }, 20_000)
}

test('TanStackRouterDevtoolsPanel forwards prop changes without strict-read warnings', async () => {
  const warn = vi.spyOn(console, 'warn')
  const [className, setClassName] = createSignal('first-class')
  const { shownPathname } = setup(() => (
    <TanStackRouterDevtoolsPanel className={className()} />
  ))
  await vi.waitFor(() => expect(shownPathname()).toBe('/'), {
    timeout: 15_000,
  })
  expect(document.querySelector('.first-class')).not.toBeNull()

  setClassName('second-class')
  flush()

  await vi.waitFor(() =>
    expect(document.querySelector('.second-class')).not.toBeNull(),
  )
  expect(warn).not.toHaveBeenCalled()
}, 20_000)
