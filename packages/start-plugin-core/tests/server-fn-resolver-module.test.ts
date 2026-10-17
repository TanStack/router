import { describe, expect, test } from 'vitest'
import { generateServerFnResolverModule } from '../src/start-compiler/server-fn-resolver-module'

const serverFnsById = {
  fn_a: {
    functionName: 'fnA',
    functionId: 'fn_a',
    extractedFilename: '/app/fn-a.ts',
    filename: '/app/fn-a.ts',
    isClientReferenced: true,
  },
}

describe('generateServerFnResolverModule', () => {
  test.each([false, true])(
    'resolves public exports and checks client access with static imports: %s',
    async (useStaticImports) => {
      const entry = {
        ...serverFnsById.fn_a,
        extractedFilename: `data:text/javascript,${encodeURIComponent(
          'export const fnA = () => "resolved"',
        )}`,
      }
      const source = generateServerFnResolverModule({
        serverFnsById: {
          fn_a: entry,
          fn_private: { ...entry, isClientReferenced: false },
        },
        includeClientReferencedCheck: true,
        memoizeModules: true,
        useStaticImports,
      })
      const { getServerFnById } = await import(
        /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`
      )
      const action = await getServerFnById('fn_a', { origin: 'client' })
      expect(action()).toBe('resolved')
      await expect(
        getServerFnById('fn_private', { origin: 'client' }),
      ).rejects.toThrow('Server function not accessible from client')
      await expect(
        getServerFnById('fn_private', { origin: 'server' }),
      ).resolves.toBe(action)
      await expect(
        getServerFnById('missing', { origin: 'server' }),
      ).rejects.toThrow('Server function info not found')
    },
  )

  // Server fns are discovered in whatever order the bundler compiles the
  // modules; the resolver (and so the bundle's content hash) must not
  // depend on it (R4).
  test('generates the same module whatever order the server fns were discovered in', () => {
    const serverFn = (name: string) => ({
      functionName: `${name}Fn`,
      functionId: name,
      filename: `/app/${name}.ts`,
      extractedFilename: `/app/${name}.ts?tss-serverfn-split`,
      isClientReferenced: true,
    })
    const names = ['b', 'c', 'a', 'd']
    const orders = [
      names,
      [...names].reverse(),
      ['a', 'b', 'c', 'd'],
      ['c', 'a', 'd', 'b'],
    ]
    const sources = orders.map((order) =>
      generateServerFnResolverModule({
        serverFnsById: Object.fromEntries(
          order.map((name) => [name, serverFn(name)]),
        ),
        includeClientReferencedCheck: true,
        memoizeModules: true,
      }),
    )
    expect(new Set(sources).size).toBe(1)
  })
})
