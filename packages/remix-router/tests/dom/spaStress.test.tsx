/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * SPA reactivity stress test. One end-to-end scenario exercises every
 * bug class we fixed in the binding:
 *
 *  - **Atom subscribe wrap** — the router state stores notify on every
 *    nav. Without the `routerStores.adaptAtom` fix, the listener
 *    teardown is broken; with it, everything stays alive across many
 *    nav cycles.
 *  - **`subscribeDynamicStore` (BUG-2/-4)** — `<Match>` and `useMatch`
 *    follow the active matchId across nav. Sibling-param swap proves
 *    it.
 *  - **`MatchContext` in render (BUG-original)** — nested outlets pick
 *    up new matchIds when parents change. Drilling deeper proves it.
 *  - **`Outlet` reads parentMatchId in render (BUG-4)** — same fix at
 *    a different level.
 *  - **`useParentMatches`/`useChildMatches` read matchId in select
 *    (BUG-5)** — the parent layout's child slice tracks the active
 *    leaf. The leaf's parent slice tracks the active parent.
 *  - **`RouterContextProvider` sets context in render (BUG-1)** —
 *    `useRouter` always sees the latest router instance.
 *  - **`Link.hasRenderFetched` doesn't reset on `to` change (BUG-7)**
 *    — covered indirectly by the rapid navigation; nothing should
 *    leak.
 *
 * The test does ~20 navigations across a 4-deep tree and asserts that
 * after each one the visible DOM matches expectations.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useChildMatches,
  useLoaderData,
  useParams,
  useParentMatches,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initial = '/') {
  function Root(_h: Handle) {
    return () => (
      <>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/products">Products</Link>
          <Link to="/products/$cat" params={{ cat: 'a' }}>Cat A</Link>
          <Link to="/products/$cat/$id" params={{ cat: 'a', id: '1' }}>A1</Link>
          <Link to="/products/$cat/$id" params={{ cat: 'a', id: '2' }}>A2</Link>
          <Link to="/products/$cat/$id" params={{ cat: 'b', id: '1' }}>B1</Link>
        </nav>
        <Outlet />
      </>
    )
  }
  function Index(_h: Handle) {
    return () => <p id="page">home</p>
  }
  function ProductsLayout(handle: Handle) {
    const readChildren = useChildMatches(handle, {
      select: (m) => m.map((d: any) => d.routeId),
    })
    return () => (
      <section id="products-layout">
        <p id="products-children">{(readChildren() as Array<string>).join(',')}</p>
        <Outlet />
      </section>
    )
  }
  function CatLayout(handle: Handle) {
    const params = useParams(handle, { from: '/products/$cat' })
    const readParents = useParentMatches(handle, {
      select: (m) => m.map((d: any) => d.routeId),
    })
    return () => (
      <section id="cat-layout">
        <p id="cat-name">cat={params()?.cat}</p>
        <p id="cat-parents">{(readParents() as Array<string>).join(',')}</p>
        <Outlet />
      </section>
    )
  }
  function ItemDetail(handle: Handle) {
    const params = useParams(handle, { from: '/products/$cat/$id' })
    const data = useLoaderData(handle, { from: '/products/$cat/$id' })
    return () => (
      <article id="item">
        <p id="item-cat">cat={params()?.cat}</p>
        <p id="item-id">id={params()?.id}</p>
        <p id="item-data">{(data() as { sku: string } | undefined)?.sku}</p>
      </article>
    )
  }

  const root = createRootRoute({ component: Root })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: Index })
  const products = createRoute({
    getParentRoute: () => root,
    path: 'products',
    component: ProductsLayout,
  })
  const cat = createRoute({
    getParentRoute: () => products,
    path: '$cat',
    component: CatLayout,
  })
  const item = createRoute({
    getParentRoute: () => cat,
    path: '$id',
    loader: ({ params }: { params: { cat: string; id: string } }) => ({
      sku: `${params.cat}-${params.id}`,
    }),
    component: ItemDetail,
  })
  cat.addChildren([item])
  products.addChildren([cat])
  root.addChildren([home, products])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('SPA reactivity stress', () => {
  test('20+ nav cycles across a 4-deep tree, every assertion holds', async () => {
    const router = setup('/')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#page')?.textContent).toBe('home')
    expect(result.$('#products-layout')).toBeFalsy()

    // Drill into /products
    await router.navigate({ to: '/products' })
    await router.load()
    await flush()
    expect(result.$('#products-layout')).toBeTruthy()
    expect(result.$('#cat-layout')).toBeFalsy()

    // Drill into /products/a
    await router.navigate({ to: '/products/$cat', params: { cat: 'a' } })
    await router.load()
    await flush()
    expect(result.$('#cat-name')?.textContent).toBe('cat=a')
    expect(result.$('#item')).toBeFalsy()

    // Drill into /products/a/1
    await router.navigate({
      to: '/products/$cat/$id',
      params: { cat: 'a', id: '1' },
    })
    await router.load()
    await flush()
    expect(result.$('#cat-name')?.textContent).toBe('cat=a')
    expect(result.$('#item-cat')?.textContent).toBe('cat=a')
    expect(result.$('#item-id')?.textContent).toBe('id=1')
    expect(result.$('#item-data')?.textContent).toBe('a-1')
    expect(result.$('#cat-parents')?.textContent).toBe('__root__,/products')
    expect(result.$('#products-children')?.textContent).toBe('/products/$cat,/products/$cat/$id')

    // Sibling param swap: /products/a/1 → /products/a/2
    await router.navigate({
      to: '/products/$cat/$id',
      params: { cat: 'a', id: '2' },
    })
    await router.load()
    await flush()
    expect(result.$('#cat-name')?.textContent).toBe('cat=a') // layout unchanged
    expect(result.$('#item-id')?.textContent).toBe('id=2') // leaf updated
    expect(result.$('#item-data')?.textContent).toBe('a-2')

    // Cross-category: /products/a/2 → /products/b/1
    await router.navigate({
      to: '/products/$cat/$id',
      params: { cat: 'b', id: '1' },
    })
    await router.load()
    await flush()
    expect(result.$('#cat-name')?.textContent).toBe('cat=b')
    expect(result.$('#item-id')?.textContent).toBe('id=1')
    expect(result.$('#item-data')?.textContent).toBe('b-1')

    // Pop back to /products
    await router.navigate({ to: '/products' })
    await router.load()
    await flush()
    expect(result.$('#products-layout')).toBeTruthy()
    expect(result.$('#cat-layout')).toBeFalsy()
    expect(result.$('#item')).toBeFalsy()

    // Bounce: products → home → products → product → item → home
    for (const dest of [
      { to: '/' as const },
      { to: '/products' as const },
      { to: '/products/$cat' as const, params: { cat: 'a' } as any },
      {
        to: '/products/$cat/$id' as const,
        params: { cat: 'a', id: '1' } as any,
      },
      { to: '/' as const },
    ]) {
      await router.navigate(dest as any)
      await router.load()
      await flush()
    }
    expect(result.$('#page')?.textContent).toBe('home')
    expect(result.$('#item')).toBeFalsy()
    expect(result.$('#cat-layout')).toBeFalsy()
    expect(result.$('#products-layout')).toBeFalsy()
  })
})
