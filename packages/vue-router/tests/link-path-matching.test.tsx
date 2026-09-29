import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { cleanup, render } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('unrelated navigation does not rebuild a fixed inactive Link', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    isServer: false,
  })
  const build = vi.spyOn(router, 'buildLocation')
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(Link, { to: '/posts/1' }, () => 'Fixed'),
    ),
  )
  const link = container.querySelector('a')!
  const fixedBuilds = () =>
    build.mock.calls.filter(([options]) => options.to === '/posts/1').length

  await router.navigate({ to: '/posts/2' })
  await Vue.nextTick()
  expect(link.getAttribute('aria-current')).toBeNull()
  const initialBuilds = fixedBuilds()
  await router.navigate({ to: '/posts/3' })
  await Vue.nextTick()

  expect(link.getAttribute('href')).toBe('/posts/1')
  expect(link.getAttribute('aria-current')).toBeNull()
  expect(fixedBuilds()).toBe(initialBuilds)
})

test('router options update a fixed Link without changing location', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    trailingSlash: 'never' as 'never' | 'always',
    isServer: false,
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(Link, { to: '/posts/1' }, () => 'Fixed'),
    ),
  )
  const link = container.querySelector('a')!
  expect(link.getAttribute('href')).toBe('/posts/1')

  router.update({ trailingSlash: 'always' })
  await Vue.nextTick()
  expect(link.getAttribute('href')).toBe('/posts/1/')
})

test('ancestor Link follows descendant navigation without matching a sibling', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/item'] }),
    isServer: false,
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(Link, { to: '/posts' }, () => 'Posts'),
    ),
  )
  const link = container.querySelector('a')!
  expect(link.getAttribute('aria-current')).toBe('page')

  await router.navigate({ to: '/posts-other' })
  await Vue.nextTick()
  expect(link.getAttribute('aria-current')).toBeNull()

  await router.navigate({ to: '/posts/item' })
  await Vue.nextTick()
  expect(link.getAttribute('aria-current')).toBe('page')
})

test('reactive internal destination follows its new pathname', async () => {
  const to = Vue.ref('/posts/1')
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    isServer: false,
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(Link, { to: to.value }, () => 'Post'),
    ),
  )
  const link = container.querySelector('a')!
  expect(link.getAttribute('aria-current')).toBe('page')

  to.value = '/posts/2'
  await Vue.nextTick()
  expect(link.getAttribute('href')).toBe('/posts/2')
  expect(link.getAttribute('aria-current')).toBeNull()

  await router.navigate({ to: '/posts/2' })
  await Vue.nextTick()
  expect(link.getAttribute('aria-current')).toBe('page')

  await router.navigate({ to: '/posts/1' })
  await Vue.nextTick()
  expect(link.getAttribute('aria-current')).toBeNull()
})

const cases = [
  { current: '/', to: '/', exact: true, active: true },
  { current: '/posts', to: '/posts/', exact: true, active: true },
  { current: '/posts/', to: '/posts', exact: true, active: true },
  { current: '/posts/item', to: '/posts', exact: true, active: false },
  { current: '/posts/item', to: '/posts', exact: false, active: true },
  { current: '/posts/item', to: '/posts/', exact: false, active: true },
  { current: '/posts-other', to: '/posts', exact: false, active: false },
]

for (const basepath of ['', '/app']) {
  test.each(cases)(
    `pathname matching agrees on server and client with basepath "${basepath}": $current -> $to, exact=$exact`,
    async ({ current, to, exact, active }) => {
      for (const isServer of [true, false]) {
        const router = createRouter({
          routeTree: createRootRoute(),
          history: createMemoryHistory({
            initialEntries: [basepath + current],
          }),
          basepath,
          trailingSlash: 'preserve',
          isServer,
        })
        const tree = Vue.h(RouterContextProvider, { router }, () =>
          Vue.h(
            Link,
            {
              to,
              activeOptions: { exact },
              inactiveProps: { class: 'inactive' },
            },
            {
              default: ({ isActive }: { isActive: boolean }) =>
                String(isActive),
            },
          ),
        )
        let container: Element
        if (isServer) {
          container = document.createElement('div')
          container.innerHTML = await renderToString(tree)
        } else {
          container = render(tree).container
        }
        const anchor = container.querySelector('a')!
        expect(anchor.textContent).toBe(String(active))
        expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
        expect(anchor.className).toBe(active ? 'active' : 'inactive')
      }
    },
  )
}

test('pathname matching reacts when exact mode changes', async () => {
  const exact = Vue.ref(true)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/item'] }),
    isServer: false,
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(
        Link,
        {
          to: '/posts',
          activeOptions: { exact: exact.value },
          inactiveProps: { class: 'inactive' },
        },
        { default: ({ isActive }: { isActive: boolean }) => String(isActive) },
      ),
    ),
  )
  const anchor = container.querySelector('a')!
  for (const mode of [true, false, true]) {
    exact.value = mode
    await Vue.nextTick()
    expect(anchor.textContent).toBe(String(!mode))
    expect(anchor.getAttribute('aria-current')).toBe(mode ? null : 'page')
    expect(anchor.className).toBe(mode ? 'inactive' : 'active')
  }
})
