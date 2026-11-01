import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Workspace, errorsIn } from './workspace'

/**
 * The fixture is a diamond:
 *
 *   web ──► storefront ──► products   (storefront mounts products)
 *    └────► account ─────► products   (account only links to products)
 *
 * and modules web mounts below `/orgs/$orgId`, one of them twice:
 *
 *   web ──► team
 *    ├────► settings                  (also below `/people/$personId`)
 *    └────► billing ─────► team       (billing only links to team
 *                    └───► settings    and to the settings of its org)
 *
 * Every test copies the packages into a temporary workspace and drives the
 * route generation through public APIs, followed by ordinary TypeScript
 * declaration builds and source checks. JavaScript is never built.
 */
const order = [
  'products',
  'storefront',
  'account',
  'team',
  'settings',
  'billing',
  'web',
]
const modules = [
  'products',
  'storefront',
  'account',
  'team',
  'settings',
  'billing',
]

let ws: Workspace

beforeEach(() => {
  ws = new Workspace()
})

afterEach(() => {
  ws.dispose()
})

async function expectChecksPass(...names: Array<string>) {
  for (const name of names) {
    const result = await ws.check(name)
    expect(result.diagnostics, `check of ${name}`).toEqual([])
    expect(result.ok).toBe(true)
  }
}

const renamedProductRoute = `import { createFileRoute } from '../routeScope.gen'
import { productSearchSchema } from '../schemas'

export const Route = createFileRoute('@route-modules/products:/$sku')({
  validateSearch: productSearchSchema,
  loader: ({ params, context }) => context.productsApi.getProduct(params.sku),
  component: ProductPage,
})

function ProductPage() {
  const product = Route.useLoaderData()
  return <h1>{product.name}</h1>
}
`

const brandsRoute = `import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/brands')({
  component: () => <h1>Brands</h1>,
})
`

describe('clean checkout', () => {
  test('generates, emits and checks the diamond from nothing', async () => {
    for (const name of order) {
      expect(ws.exists(name, 'src/routeTree.gen.ts')).toBe(false)
      expect(ws.exists(name, '.tanstack')).toBe(false)
    }

    await ws.buildGraph(order, modules)
    await expectChecksPass(...order)

    expect(ws.log.some((entry) => entry.operation === 'build')).toBe(false)
    for (const name of order) {
      expect(ws.exists(name, 'dist')).toBe(false)
    }
  })

  test('a module checks standalone, without any application', async () => {
    const standalone = new Workspace(['products', 'account'])
    try {
      await standalone.buildGraph(
        ['products', 'account'],
        ['products', 'account'],
      )
      const result = await standalone.check('account')
      expect(result.diagnostics).toEqual([])
    } finally {
      standalone.dispose()
    }
  })

  test.each([
    { name: 'default', header: undefined },
    { name: 'custom', header: ['// Package license header'] },
    { name: 'empty', header: [] },
  ])(
    'emits portable client-view declarations with a $name header',
    async ({ header }) => {
      for (const name of ['products', 'storefront']) {
        if (header !== undefined) {
          ws.write(
            name,
            'tsr.config.json',
            JSON.stringify({ routeTreeFileHeader: header }),
          )
        }
        await ws.generate(name)
        // Both packages use an ordinary src-inclusive declaration build. The
        // storefront's client view also references a mounted module's tree.
        const emitted = await ws.emitTypes(name)
        expect(emitted.diagnostics, `declarations of ${name}`).toEqual([])
        expect(emitted.ok).toBe(true)
        expect(
          ws.exists(name, '.tanstack/types/src/routeTree.gen.client.d.ts'),
        ).toBe(true)
      }
      await expectChecksPass('products', 'storefront')
    },
  )
})

describe('published declaration updates', () => {
  test('a provider param rename reaches consumers through unchanged intermediate declarations', async () => {
    await ws.buildGraph(order, modules)
    const storefrontDeclarations = ws.snapshot('storefront', '.tanstack/types')
    const storefrontSources = ws.snapshot('storefront', 'src')
    const logBefore = ws.log.length

    // Rename the product route param: products updates its own links,
    // regenerates and re-emits.
    ws.remove('products', 'src/routes/$productId.tsx')
    ws.write('products', 'src/routes/$sku.tsx', renamedProductRoute)
    ws.edit('products', 'src/routes/index.tsx', (source) =>
      source
        .replace('to="/$productId"', 'to="/$sku"')
        .replace('{ productId: product.id }', '{ sku: product.id }'),
    )
    ws.edit('products', 'src/routes/legacy.tsx', (source) =>
      source
        .replace("to: '/$productId'", "to: '/$sku'")
        .replace("productId: '42'", "sku: '42'"),
    )
    await ws.generate('products')
    expect((await ws.emitTypes('products')).ok).toBe(true)

    // Consumers only recheck their source.
    const account = await ws.check('account')
    expect(account.ok).toBe(false)
    expect(errorsIn(account.diagnostics, 'src/routes/index.tsx')).not.toEqual(
      [],
    )
    expect(
      errorsIn(account.diagnostics, 'src/routes/orders.$orderId.tsx'),
    ).not.toEqual([])

    // The application reaches products only through storefront's contract,
    // whose declarations were neither regenerated nor re-emitted.
    const web = await ws.check('web')
    expect(web.ok).toBe(false)
    expect(
      errorsIn(web.diagnostics, 'src/routes/index.tsx').join('\n'),
    ).toMatch(/productId|\$productId/)
    expect(ws.snapshot('storefront', '.tanstack/types')).toEqual(
      storefrontDeclarations,
    )
    expect(ws.snapshot('storefront', 'src')).toEqual(storefrontSources)
    expect(
      ws.log
        .slice(logBefore)
        .filter((entry) => entry.pkg !== 'products')
        .map((entry) => entry.operation),
    ).toEqual(['check', 'check'])

    // Updating the consumer links makes the graph valid again.
    ws.edit('account', 'src/routes/index.tsx', (source) =>
      source
        .replace('to="/$productId"', 'to="/$sku"')
        .replace("{ productId: 'last-viewed' }", "{ sku: 'last-viewed' }"),
    )
    ws.edit('account', 'src/routes/orders.$orderId.tsx', (source) =>
      source
        .replace(
          "'@route-modules/products:/$productId'",
          "'@route-modules/products:/$sku'",
        )
        .replace("to: '/$productId'", "to: '/$sku'")
        .replace('{ productId: order.productId }', '{ sku: order.productId }'),
    )
    ws.edit('storefront', 'src/routes/index.tsx', (source) =>
      source
        .replace('to="/$productId"', 'to="/$sku"')
        .replace("{ productId: 'featured' }", "{ sku: 'featured' }"),
    )
    ws.edit('web', 'src/routes/index.tsx', (source) =>
      source
        .replace(
          "'@route-modules/products:/$productId'",
          "'@route-modules/products:/$sku'",
        )
        .replace('to="/$productId"', 'to="/$sku"')
        .replace("{ productId: 'home-pick' }", "{ sku: 'home-pick' }"),
    )
    await expectChecksPass('account', 'storefront', 'web')
  })

  test('route generation does not depend on declaration emits', async () => {
    // Task runners cache generation by its inputs: emitting must not change
    // what the next generation writes.
    await ws.generate('products')
    const manifest = ws.read('products', '.tanstack/route-module.json')
    expect((await ws.emitTypes('products')).ok).toBe(true)
    await ws.generate('products')
    expect(ws.read('products', '.tanstack/route-module.json')).toBe(manifest)
  })

  test('a schema-only edit refreshes types without changing the topology', async () => {
    await ws.buildGraph(order, modules)
    const routeTree = ws.read('products', 'src/routeTree.gen.ts')
    const { topologyToken } = ws.manifest('products')

    // `tab` becomes a required search param; products updates its own link.
    ws.edit('products', 'src/schemas.ts', (source) =>
      source.replace(".default('specs')", ''),
    )
    ws.edit('products', 'src/routes/index.tsx', (source) =>
      source.replace(
        'params={{ productId: product.id }}',
        "params={{ productId: product.id }}\n            search={{ tab: 'specs' }}",
      ),
    )
    await ws.generate('products')
    expect(ws.read('products', 'src/routeTree.gen.ts')).toBe(routeTree)
    expect(ws.manifest('products').topologyToken).toBe(topologyToken)
    expect((await ws.emitTypes('products')).ok).toBe(true)

    // Navigations without `tab` now fail; the account link passes `tab`.
    const web = await ws.check('web')
    expect(errorsIn(web.diagnostics, 'src/routes/index.tsx')).not.toEqual([])
    const storefront = await ws.check('storefront')
    expect(
      errorsIn(storefront.diagnostics, 'src/routes/index.tsx'),
    ).not.toEqual([])
    const account = await ws.check('account')
    expect(errorsIn(account.diagnostics, 'src/routes/index.tsx')).toEqual([])
    expect(
      errorsIn(account.diagnostics, 'src/routes/orders.$orderId.tsx').join(
        '\n',
      ),
    ).toMatch(/search/)
  })

  test('a deleted provider route fails the obsolete consumer link', async () => {
    await ws.buildGraph(order, modules)

    ws.remove('products', 'src/routes/compare.tsx')
    await ws.generate('products')
    expect(
      ws.manifest('products').routes.map((route) => route.id),
    ).not.toContain('@route-modules/products:/compare')
    expect((await ws.emitTypes('products')).ok).toBe(true)
    expect(
      ws.exists('products', '.tanstack/types/src/routes/compare.d.ts'),
    ).toBe(false)

    const storefront = await ws.check('storefront')
    expect(storefront.ok).toBe(false)
    expect(
      errorsIn(storefront.diagnostics, 'src/routes/index.tsx').join('\n'),
    ).toMatch(/compare/)
  })

  test('a new provider route becomes visible to consumers', async () => {
    await ws.buildGraph(order, modules)
    ws.edit('web', 'src/routes/index.tsx', (source) =>
      source.replace(
        '<span>',
        '<products.Link to="/brands">Brands</products.Link>\n      <span>',
      ),
    )
    expect((await ws.check('web')).ok).toBe(false)

    ws.write('products', 'src/routes/brands.tsx', brandsRoute)
    await ws.generate('products')
    expect((await ws.emitTypes('products')).ok).toBe(true)
    await expectChecksPass('web')
  })
})

describe('the declaration boundary', () => {
  test('consumers load provider declarations, never provider sources', async () => {
    await ws.buildGraph(order, modules)
    const files = ws.listProgramFiles('account')
    expect(
      files.some((file) => file.includes('/products/.tanstack/types/')),
    ).toBe(true)
    expect(files.some((file) => file.includes('/products/src/'))).toBe(false)
  })

  test('consumers check against declarations only, without library skipping', async () => {
    await ws.buildGraph(order, modules)
    ws.remove('products', 'src')
    ws.edit('account', 'tsconfig.json', (source) =>
      source.replace('"skipLibCheck": true', '"skipLibCheck": false'),
    )
    await expectChecksPass('account')

    // A missing declaration fails instead of falling back to sources.
    ws.remove('products', '.tanstack/types/src/api.d.ts')
    const result = await ws.check('account')
    expect(result.ok).toBe(false)
    expect(result.diagnostics.join('\n')).toMatch(/\.\/api/)
  })

  test('module types stay precise across the boundary', async () => {
    await ws.buildGraph(order, modules)
    ws.write(
      'account',
      'src/type-assertions.tsx',
      `import { Route as AccountIndexRoute } from './routes/index'
import { getRouteApi, products } from './routeScope.gen'
import type { Price, Product } from '@route-modules/products/api'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type IsAny<T> = 0 extends 1 & T ? true : false

const productApi = getRouteApi('@route-modules/products:/$productId')

export function useAssertions() {
  const product = productApi.useLoaderData()
  const loaderData: Equal<typeof product, Product> = true
  const notAny: IsAny<typeof product> = false
  const brand: Equal<typeof product.price, Price> = true

  // Validated search output: \`tab\` has a default, so it is always set.
  const search = productApi.useSearch()
  const output: Equal<typeof search, { tab: 'specs' | 'reviews' }> = true

  // Context the module root requires from its host.
  const context = AccountIndexRoute.useRouteContext()
  const user: Equal<typeof context.user, { id: string }> = true

  return [loaderData, notAny, brand, output, user]
}

export const links = (
  <>
    {/* Navigation input: \`tab\` is optional. */}
    <products.Link to="/$productId" params={{ productId: '1' }} />
    <products.Link
      to="/$productId"
      params={{ productId: '1' }}
      // @ts-expect-error the search input is validated
      search={{ tab: 'other' }}
    />
    {/* @ts-expect-error a required search input is missing */}
    <products.Link to="/compare" />
    <products.Link to="/compare" search={{ ids: ['1'] }} />
    {/* Nested routing survives the boundary. */}
    <products.Link to="/deals" />
    <products.Link to="/catalog/{-$category}" />
    <products.Link to="/catalog/{-$category}" params={{ category: 'shoes' }} />
    <products.Link to="/files/$" params={{ _splat: 'a/b' }} />
    {/* @ts-expect-error pathless layout segments are not part of paths */}
    <products.Link to="/_layout/deals" />
    {/* @ts-expect-error unknown module-local path */}
    <products.Link to="/nope" />
  </>
)
`,
    )
    await expectChecksPass('account')
  })

  test('declaration maps lead to the module sources from any output directory', async () => {
    ws.edit('products', 'tsconfig.route-types.json', (source) =>
      source.replace('".tanstack/types"', '"route-types"'),
    )
    ws.edit('products', 'package.json', (source) =>
      source.replaceAll('./.tanstack/types/', './route-types/'),
    )
    await ws.buildGraph(order, modules)
    await expectChecksPass('account')

    const map = 'route-types/src/routes/$productId.d.ts.map'
    const { sources } = JSON.parse(ws.read('products', map))
    expect(sources).toHaveLength(1)
    expect(
      path.resolve(path.dirname(ws.file('products', map)), sources[0]),
    ).toBe(ws.file('products', 'src/routes/$productId.tsx'))
  })
})

describe('composition', () => {
  test('a missing provider fails the application generation', async () => {
    await ws.buildGraph(modules, modules)
    ws.edit('web', 'tsr.config.json', (source) =>
      source.replace(
        '{ "module": "@route-modules/storefront", "at": "/shop" },',
        '',
      ),
    )
    await expect(ws.generate('web')).rejects.toThrow(
      /uses routes of "@route-modules\/products", which is not installed/,
    )
  })

  test('a host route without the required context fails the check', async () => {
    await ws.buildGraph(modules, modules)
    // Mount account at the root, which provides no `user`.
    ws.edit('web', 'tsr.config.json', (source) =>
      source.replace('"parent": "/_authenticated",', ''),
    )
    ws.remove('web', 'src/routes/_authenticated.tsx')
    await ws.generate('web')
    const result = await ws.check('web')
    expect(result.ok).toBe(false)
    expect(
      errorsIn(result.diagnostics, 'src/routeTree.gen.ts').join('\n'),
    ).toMatch(/requires router context 'user'/)
  })

  test('mounting a module twice is rejected', async () => {
    await ws.buildGraph(modules, modules)
    ws.edit('web', 'tsr.config.json', (source) =>
      source.replace(
        '"includes": [',
        '"includes": [\n      { "module": "@route-modules/products", "at": "/p" },',
      ),
    )
    await expect(ws.generate('web')).rejects.toThrow(/installed twice/)
  })

  test('a mount path with path params is rejected', async () => {
    await ws.buildGraph(modules, modules)
    ws.edit('web', 'tsr.config.json', (source) =>
      source.replace('"at": "/shop"', '"at": "/$tenant"'),
    )
    await expect(ws.generate('web')).rejects.toThrow(/static path/)
  })

  test('two applications compose the same modules independently', async () => {
    ws.addPackage('admin', 'web')
    ws.edit('admin', 'package.json', (source) =>
      source.replace('@route-modules/web', '@route-modules/admin'),
    )
    ws.edit('admin', 'tsr.config.json', (source) =>
      source.replace('"at": "/shop"', '"at": "/store"'),
    )
    await ws.buildGraph([...order, 'admin'], modules)
    await expectChecksPass('web', 'admin')

    const productsDeclarations = Object.keys(
      ws.snapshot('products', '.tanstack/types'),
    )
      .map((file) => ws.read('products', `.tanstack/types/${file}`))
      .join('\n')
    expect(productsDeclarations).not.toMatch(/@route-modules\/(web|admin)/)
    expect(productsDeclarations).not.toMatch(/interface Register\b/)
  })
})

describe('mounting under path params', () => {
  test('the application passes the path params above a module it mounts', async () => {
    await ws.buildGraph(order, modules)
    ws.edit('web', 'src/routes/index.tsx', (source) =>
      source.replace(" params={{ orgId: 'acme' }}", ''),
    )

    const web = await ws.check('web')
    // `/` has no params of its own: the host params make them required.
    expect(
      errorsIn(web.diagnostics, 'src/routes/index.tsx').join('\n'),
    ).toMatch(/'params' is missing.*@route-modules\/team/)
  })

  test('a module that links into a module under path params is mounted below them', async () => {
    await ws.buildGraph(order, modules)
    ws.edit('web', 'tsr.config.json', (source) =>
      source.replace(
        `"module": "@route-modules/billing",
        "parent": "/orgs/$orgId",`,
        '"module": "@route-modules/billing",',
      ),
    )

    await expect(ws.generate('web')).rejects.toThrow(
      '"@route-modules/billing" links into "@route-modules/team", which is mounted below "/orgs/$orgId", but "@route-modules/billing" is mounted at "/billing"',
    )
  })
})
