import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Workspace, expectChecksPass, expectEmitsPass } from './workspace'

/**
 * products uses account and account uses products (a `uses` cycle), and
 * products uses storefront while storefront includes products (a mixed
 * cycle). Generation reads only the package.json files of used modules and
 * declaration builds compile against the generated stand-ins in
 * `.tanstack/route-types-stubs.d.ts`, so `uses` imposes no order on either.
 * Only `includes` does: storefront generates and emits after products.
 */
const packages = ['products', 'account', 'storefront']

let ws: Workspace

beforeEach(() => {
  ws = new Workspace(packages)
})

afterEach(() => {
  ws.dispose()
})

/** Content hashes of every emitted declaration file. */
const declarations = (name: string) => ws.hashes(name, '.tanstack/types')

describe('route modules that link to each other', () => {
  test.each([
    ['products', 'account', 'storefront'],
    ['account', 'products', 'storefront'],
    ['products', 'storefront', 'account'],
  ])('generates %s, %s, %s from a clean checkout', async (...order) => {
    for (const name of order) {
      await ws.generate(name)
    }
    for (const name of packages) {
      expect(ws.exists(name, '.tanstack/route-types-stubs.d.ts')).toBe(true)
    }
    const stubs = ws.read('products', '.tanstack/route-types-stubs.d.ts')
    expect(stubs).toContain(
      "declare module '@route-modules/account/route-types'",
    )
    expect(stubs).toContain(
      "declare module '@route-modules/storefront/route-types'",
    )
    // Including still orders generation: storefront reads products' manifest.
    expect(
      ws.read('storefront', '.tanstack/route-types-stubs.d.ts'),
    ).not.toContain('declare module')
  })

  test('including a module still requires its manifest', async () => {
    await expect(ws.generate('storefront')).rejects.toThrow(
      /"@route-modules\/products" has no route module manifest/,
    )
  })

  test('a used module contributes nothing to the generated files', async () => {
    await ws.generate('products')
    const before = ws.snapshot('products', 'src')
    await ws.generate('account')
    await ws.generate('storefront')
    await ws.generate('products')
    expect(ws.snapshot('products', 'src')).toEqual(before)
  })

  test.each([
    ['products', 'account', 'storefront'],
    ['account', 'products', 'storefront'],
    ['products', 'storefront', 'account'],
  ])(
    'emits declarations as %s, %s, %s and checks every module',
    async (...order) => {
      for (const name of ['products', 'account', 'storefront']) {
        await ws.generate(name)
      }
      await expectEmitsPass(ws, ...order)
      await expectChecksPass(ws, ...packages)
    },
  )

  test('the stand-ins emit the same declarations as the real contracts', async () => {
    for (const name of packages) {
      await ws.generate(name)
    }
    await expectEmitsPass(ws, ...packages)
    const withStubs = {
      products: declarations('products'),
      account: declarations('account'),
    }
    // Every contract exists now: build the two using modules against the
    // real contracts instead of the stand-ins.
    for (const name of ['products', 'account'] as const) {
      const emitted = await ws.emitTypesAgainstContracts(name)
      expect(emitted.diagnostics, `declarations of ${name}`).toEqual([])
      expect(declarations(name)).toEqual(withStubs[name])
    }
  })

  test('an export typed from a used module is the one declaration that depends on it', async () => {
    // The rule the stand-ins rely on: a module's exported declarations must
    // not derive from a used module's types, whether imported from it or
    // obtained through its namespace. This helper breaks the rule on purpose.
    ws.write(
      'account',
      'src/ordered-product.ts',
      `import { products } from './routeScope.gen'

const productRoute = products.getRouteApi('@route-modules/products:/$productId')

export function useOrderedProduct() {
  return productRoute.useLoaderData()
}
`,
    )
    for (const name of packages) {
      await ws.generate(name)
    }
    await expectEmitsPass(ws, 'products', 'account')
    const withStubs = declarations('account')
    expect((await ws.emitTypesAgainstContracts('account')).ok).toBe(true)
    const real = declarations('account')
    const changed = Object.keys(real).filter(
      (file) => real[file] !== withStubs[file],
    )
    expect(changed).toEqual([
      'src/ordered-product.d.ts',
      'src/ordered-product.d.ts.map',
    ])
    // Against the stand-ins the loader data is unknown; against the real
    // contract it is the product.
    expect(
      ws.read('account', '.tanstack/types/src/ordered-product.d.ts'),
    ).toContain('price: import("@route-modules/products/api").Price')
  })

  test('a source check names the used contract it is missing', async () => {
    for (const name of packages) {
      await ws.generate(name)
    }
    expect((await ws.emitTypes('products')).ok).toBe(true)
    // account has not emitted: products' declaration build did not need it,
    // its source check does.
    const result = await ws.check('products')
    expect(result.ok).toBe(false)
    expect(result.diagnostics.join('\n')).toMatch(
      /Cannot find module '@route-modules\/account\/route-types'/,
    )
  })
})
