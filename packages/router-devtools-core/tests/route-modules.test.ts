import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { mountRouteModule } from '@tanstack/router-core/_internal/route-module'
import { TanStackRouterDevtoolsPanelCore } from '../src/TanStackRouterDevtoolsPanelCore'
import type { AnyRoute } from '@tanstack/router-core'

beforeAll(async () => {
  // Browsers expose elements with an id as window properties, and goober
  // finds its style sheet as `window._goober`. jsdom does not, so without
  // this every style rule adds a style element and later tests slow down.
  Object.defineProperty(window, '_goober', {
    configurable: true,
    get: () => document.getElementById('_goober'),
  })
  await import('../src/BaseTanStackRouterDevtoolsPanel')
}, 30_000)

const panels: Array<TanStackRouterDevtoolsPanelCore> = []

afterEach(() => {
  // Unmounting stops the panel's timers and reactive roots.
  panels.splice(0).forEach((panel) => panel.unmount())
  document.body.innerHTML = ''
  localStorage.clear()
})

function createModuleRoot(moduleId: string) {
  return new BaseRoute({ _module: moduleId } as any) as AnyRoute
}

/**
 * root
 * └── /shop
 *     └── @acme/products      (mounted at /products)
 *         ├── /
 *         ├── /$productId
 *         └── @acme/reviews   (mounted at /reviews)
 *             └── /
 */
function setup(pathname: string) {
  const root = new BaseRootRoute({})
  const shop = new BaseRoute({ getParentRoute: () => root, path: '/shop' })
  const products = createModuleRoot('@acme/products')
  const reviews = createModuleRoot('@acme/reviews')
  reviews.addChildren([
    new BaseRoute({ getParentRoute: () => reviews, path: '/' }),
  ])
  products.addChildren([
    new BaseRoute({ getParentRoute: () => products, path: '/' }),
    new BaseRoute({ getParentRoute: () => products, path: '/$productId' }),
    reviews,
  ])
  mountRouteModule(reviews, { parent: () => products, at: '/reviews' } as any)
  mountRouteModule(products, {
    parent: () => shop as AnyRoute,
    at: '/products',
  } as any)
  const routeTree = root.addChildren([shop.addChildren([products])])
  const router = new RouterCore({ routeTree, isServer: false }, () => ({
    createMutableStore: createNonReactiveMutableStore,
    createReadonlyStore: createNonReactiveReadonlyStore,
    batch: (fn) => fn(),
  }))
  const panel = new TanStackRouterDevtoolsPanelCore({
    router,
    routerState: { ...router.state, matches: router.matchRoutes(pathname, {}) },
  })
  const container = document.createElement('div')
  document.body.append(container)
  panel.mount(container)
  panels.push(panel)
  return container
}

function find(container: HTMLElement, label: string) {
  return container.querySelector<HTMLElement>(`[aria-label="${label}"]`)
}

async function waitFor(container: HTMLElement, label: string) {
  await vi.waitFor(() => expect(find(container, label)).not.toBeNull())
  return find(container, label)!
}

/** The element whose own text is `text` (tab buttons, section headers). */
async function waitForText(container: HTMLElement, text: string) {
  const lookup = () =>
    [...container.querySelectorAll<HTMLElement>('*')].find(
      (element) =>
        element.childElementCount === 0 && element.textContent === text,
    )
  await vi.waitFor(() => expect(lookup()).toBeDefined())
  return lookup()!
}

test('groups module routes, nested where their module is mounted', async () => {
  const container = setup('/shop/products/7')
  const products = await waitFor(container, 'Route module @acme/products')

  expect(
    products.querySelector('[aria-label="Route module @acme/reviews"]'),
  ).not.toBeNull()
  expect(
    products.querySelector(
      '[aria-label="Open match details for @acme/products:/$productId"]',
    ),
  ).not.toBeNull()
})

test('collapses a module group and remembers it', async () => {
  const container = setup('/shop/products/7')
  ;(await waitFor(container, 'Collapse @acme/products')).click()

  await vi.waitFor(() =>
    expect(
      find(container, 'Open match details for @acme/products:/$productId'),
    ).toBeNull(),
  )
  expect(
    JSON.parse(localStorage.getItem('tanstackRouterDevtoolsCollapsedModules')!),
  ).toEqual(['@acme/products'])
  ;(await waitFor(container, 'Expand @acme/products')).click()
  await waitFor(container, 'Open match details for @acme/products:/$productId')
})

test('filters the route tree to one module', async () => {
  const container = setup('/shop/products/7')
  const filter = (await waitFor(
    container,
    'Show routes of',
  )) as HTMLSelectElement
  filter.value = '@acme/reviews'
  filter.dispatchEvent(new Event('change'))

  await vi.waitFor(() =>
    expect(
      find(container, 'Open match details for @acme/products:/$productId'),
    ).toBeNull(),
  )
  expect(find(container, 'Route module @acme/reviews')).not.toBeNull()
  expect(
    find(container, 'Open match details for @acme/reviews:/'),
  ).not.toBeNull()
})

test('shows a module with its mount, parent module, routes and matches', async () => {
  const container = setup('/shop/products/reviews')
  ;(await waitFor(container, 'Open module details for @acme/reviews')).click()

  const details = await waitFor(container, 'Module details')
  const text = details.textContent
  expect(text).toContain('@acme/reviews')
  expect(text).toContain('Mount path:/shop/products/reviews')
  expect(text).toContain('Parent module:@acme/products')
  // The module's own routes, with the local and the final path.
  const route = details.querySelector('[title="@acme/reviews:/"]')!
  expect(
    [...route.querySelectorAll('code')].map((code) => code.textContent),
  ).toEqual(['/', '/shop/products/reviews/'])
  expect(text).not.toContain('/$productId')
  expect(
    details.querySelector(
      '[aria-label^="Open match details for @acme/reviews:/"]',
    ),
  ).not.toBeNull()
})

test('badges matches with their module and shows local and final paths', async () => {
  const container = setup('/shop/products/7')
  ;(await waitForText(container, 'Matches')).click()
  await vi.waitFor(() =>
    expect(
      container.querySelector(
        '[aria-label^="Open match details for @acme/products:/$productId"] [aria-label="Open module details for @acme/products"]',
      ),
    ).not.toBeNull(),
  )
  ;(await waitForText(container, 'Routes')).click()
  ;(
    await waitFor(
      container,
      'Open match details for @acme/products:/$productId',
    )
  ).click()
  const details = (await waitForText(container, 'Match Details')).parentElement!
  expect(details.textContent).toContain('Local path:/$productId')
  expect(details.textContent).toContain('Path:/shop/products/$productId')
  expect(
    details.querySelector(
      '[aria-label="Open module details for @acme/products"]',
    ),
  ).not.toBeNull()
})
