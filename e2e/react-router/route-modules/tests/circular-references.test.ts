import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Workspace } from './workspace'

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

/** Content hashes of every emitted declaration file, independent of mtimes. */
function declarations(name: string) {
  return Object.fromEntries(
    Object.entries(ws.snapshot(name, '.tanstack/types')).map(
      ([file, stamp]) => [file, stamp.split('@')[0]],
    ),
  )
}

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
      for (const name of order) {
        const emitted = await ws.emitTypes(name)
        expect(emitted.diagnostics, `declarations of ${name}`).toEqual([])
        expect(emitted.ok).toBe(true)
      }
      for (const name of packages) {
        const result = await ws.check(name)
        expect(result.diagnostics, `check of ${name}`).toEqual([])
        expect(result.ok).toBe(true)
      }
    },
  )

  test('the stand-ins emit the same declarations as the real contracts', async () => {
    for (const name of packages) {
      await ws.generate(name)
    }
    for (const name of ['products', 'account', 'storefront']) {
      expect((await ws.emitTypes(name)).ok).toBe(true)
    }
    const withStubs = {
      products: declarations('products'),
      account: declarations('account'),
    }
    // Every contract exists now: build the two using modules against the
    // real contracts instead of the stand-ins.
    for (const name of ['products', 'account']) {
      ws.write(
        name,
        'tsconfig.route-types.real.json',
        JSON.stringify({
          extends: './tsconfig.route-types.json',
          compilerOptions: { outDir: '.tanstack/types' },
          include: ['src'],
        }),
      )
      const emitted = await ws.emitTypes(name, 'tsconfig.route-types.real.json')
      expect(emitted.diagnostics, `declarations of ${name}`).toEqual([])
      expect(declarations(name)).toEqual(withStubs[name as 'products'])
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
    for (const name of ['products', 'account']) {
      expect((await ws.emitTypes(name)).ok).toBe(true)
    }
    const withStubs = declarations('account')
    ws.write(
      'account',
      'tsconfig.route-types.real.json',
      JSON.stringify({
        extends: './tsconfig.route-types.json',
        compilerOptions: { outDir: '.tanstack/types' },
        include: ['src'],
      }),
    )
    expect(
      (await ws.emitTypes('account', 'tsconfig.route-types.real.json')).ok,
    ).toBe(true)
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
