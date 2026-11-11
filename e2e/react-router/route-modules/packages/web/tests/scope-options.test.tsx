import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from '../src/routeTree.gen'
import { orgSettings, personSettings } from '../src/routeScope.gen'
import * as settings from '@route-modules/settings/scope'

async function createApp() {
  const router = createRouter({
    routeTree,
    context: {
      productsApi: {
        getProduct: async (id) => ({ id, name: id, price: 10 as never }),
        listProducts: async () => [],
      },
    },
    history: createMemoryHistory({
      initialEntries: ['/orgs/7/settings/profile'],
    }),
  })
  await router.load()
  return router
}

test('scoped consumers reject options from another named installation', async () => {
  const router = await createApp()
  // JSON is a realistic untyped source; typed conflicts are covered separately.
  const foreign = JSON.parse(
    JSON.stringify(
      personSettings.linkOptions({
        to: '/members',
        params: { personId: 'u1' },
      }),
    ),
  )
  for (const Component of [
    orgSettings.Link,
    orgSettings.Navigate,
    orgSettings.MatchRoute,
  ]) {
    expect(() =>
      renderToString(
        <RouterContextProvider router={router}>
          {React.createElement(Component as React.ComponentType<any>, foreign)}
        </RouterContextProvider>,
      ),
    ).toThrow(/Cannot use route scope/)
  }
  expect(() => orgSettings.linkOptions(foreign)).toThrow(
    /Cannot use route scope/,
  )
  expect(() => orgSettings.redirect(foreign)).toThrow(/Cannot use route scope/)
})

test('same-scope options and neutral consumers preserve their destination', async () => {
  const router = await createApp()
  const home = orgSettings.linkOptions({
    to: '/members',
    params: { orgId: '7' },
  })
  expect(router.buildLocation(home).href).toBe('/orgs/7/settings/members')
  expect(
    renderToString(
      <RouterContextProvider router={router}>
        <orgSettings.Link {...home}>Members</orgSettings.Link>
      </RouterContextProvider>,
    ),
  ).toContain('href="/orgs/7/settings/members"')
})

test('a context-free local receiver preserves its constraint until navigation', async () => {
  const router = await createApp()
  const local = settings.linkOptions({ to: '/members' })
  const explicit = personSettings.linkOptions({
    to: '/members',
    params: { personId: 'u1' },
  })
  const deferred = settings.linkOptions(explicit)
  const redirect = settings.redirect(explicit)
  function Receiver({ options }: { options: typeof local | typeof deferred }) {
    // The generated namespace is the explicit receiving installation. The
    // normal hook supplies its router view; no private origin is fabricated.
    const scopedRouter = orgSettings.useRouter()
    return <span>{scopedRouter.buildLocation(options).href}</span>
  }
  function renderOptions(options: typeof local | typeof deferred) {
    return renderToString(
      <RouterContextProvider router={router}>
        <Receiver options={options} />
      </RouterContextProvider>,
    )
  }
  expect(renderOptions(local)).toContain('/orgs/7/settings/members')
  expect(() => renderOptions(deferred)).toThrow(/Cannot use route scope/)
  // The redirect's public options keep the same unresolved receiving contract.
  expect(() => renderOptions(redirect.options)).toThrow(
    /Cannot use route scope/,
  )
})

test('an explicit receiving scope resolves a deferred local constraint', async () => {
  const router = await createApp()
  const options = settings.linkOptions(
    orgSettings.linkOptions({ to: '/members', params: { orgId: '7' } }),
  )
  function Receiver() {
    const href = orgSettings.useRouter().buildLocation(options).href
    return <span>{href}</span>
  }
  expect(
    renderToString(
      <RouterContextProvider router={router}>
        <Receiver />
      </RouterContextProvider>,
    ),
  ).toContain('/orgs/7/settings/members')
})

test('stamped mask options cannot silently retarget a sibling installation', async () => {
  const router = await createApp()
  const mask = JSON.parse(
    JSON.stringify(
      personSettings.linkOptions({
        to: '/members',
        params: { personId: 'u1' },
      }),
    ),
  )
  const options = orgSettings.linkOptions({
    to: '/members',
    params: { orgId: '7' },
    mask,
  })
  expect(() => router.buildLocation(options)).toThrow(/Cannot use route scope/)
})
