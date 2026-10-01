import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { expect, test, vi } from 'vitest'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

test('preserves selected state props and styling during SSR', async () => {
  const active = vi.fn(() => ({
    class: ['selected', [{ 'active-object': true, hidden: false }]],
    style: { color: 'blue' },
    title: 'selected',
  }))
  const unused = vi.fn(() => ({ class: 'unused' }))
  const root = createRootRoute({
    component: () =>
      Vue.h(Vue.Fragment, [
        Vue.h(
          Link,
          {
            to: '/',
            class: 'base',
            style: { color: 'red', marginTop: '2px' },
            activeProps: active,
            inactiveProps: unused,
          },
          () => 'Active',
        ),
        Vue.h(
          Link,
          {
            to: '/other',
            activeProps: unused,
            inactiveProps: { class: { idle: true }, 'data-state': 'idle' },
          },
          () => 'Inactive',
        ),
        Vue.h(Link, { to: '/' }, () => 'Default'),
        Vue.h(Link, { to: '/', activeProps: {} }, () => 'Empty'),
      ]),
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history,
    isServer: true,
  })
  try {
    await router.load()
    const html = await renderToString(
      Vue.createSSRApp(() => Vue.h(RouterProvider, { router })),
    )
    const container = document.createElement('div')
    container.innerHTML = html
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(4)
    expect([...links[0]!.classList]).toEqual([
      'base',
      'selected',
      'active-object',
    ])
    expect(links[0]!.style.color).toBe('blue')
    expect(links[0]!.style.marginTop).toBe('2px')
    expect(links[0]!.getAttribute('title')).toBe('selected')
    expect(links[1]!.className).toBe('idle')
    expect(links[1]!.getAttribute('data-state')).toBe('idle')
    expect(links[2]!.className).toBe('active')
    expect(links[3]!.className).toBe('')
    expect(active).toHaveBeenCalledWith()
    expect(unused).not.toHaveBeenCalled()
  } finally {
    history.destroy()
  }
})

test('useLinkProps preserves its ref access contract during SSR', async () => {
  let isRef = false
  const HookLink = Vue.defineComponent({
    setup() {
      const props = useLinkProps({ to: '/target' }) as unknown as Vue.Ref<
        Record<string, unknown>
      >
      isRef = Vue.isRef(props)
      return () => Vue.h('a', props.value, 'Hook target')
    },
  })
  const root = createRootRoute({ component: () => Vue.h(HookLink) })
  const history = createMemoryHistory({ initialEntries: ['/target'] })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
    isServer: true,
  })
  try {
    await router.load()
    const html = await renderToString(
      Vue.createSSRApp(() => Vue.h(RouterProvider, { router })),
    )
    const container = document.createElement('div')
    container.innerHTML = html
    const link = container.querySelector('a')!
    expect(isRef).toBe(true)
    expect(link).toHaveAttribute('href', '/target')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveTextContent('Hook target')
  } finally {
    history.destroy()
  }
})
