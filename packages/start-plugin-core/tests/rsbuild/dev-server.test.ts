/**
 * The Start compiler on a running Rsbuild dev server: editing a factory
 * module rebuilds every client module compiled against it.
 */
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'
import { startRsbuildDevServer } from '../rsbuild-dev-server'

const timeout = 30_000

describe('Rsbuild dev: editing a server fn factory', () => {
  /**
   * `src/a1.ts` and `src/a2.ts` define server fns with the `base` builder of
   * `src/b.ts`, imported from `importFrom`; `src/b.ts` starts as a
   * `createServerFn()` builder and becomes a plain object, or the other way
   * around (`toFactory`). Returns the client output afterwards.
   */
  async function editFactory(importFrom: string, toFactory: boolean) {
    const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
    const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`
    const importer = (name: string) => `import { base } from '${importFrom}'
import { db } from './db.server'
export const ${name} = base.handler(async () => db.x())
`
    const server = await startRsbuildDevServer({
      files: {
        'src/b.ts': toFactory ? plain : factory,
        'src/c.ts': `export * from './b'\n`,
        'src/db.server.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
        'src/a1.ts': importer('fn1'),
        'src/a2.ts': importer('fn2'),
        'src/entry.ts': `import { fn1 } from './a1'
import { fn2 } from './a2'
console.log(fn1, fn2)
`,
      },
    })
    const output = async () => Object.values(await server.outputs()).join('\n')
    expect((await output()).includes('MARK_DB_SECRET')).toBe(toFactory)

    await server.edit({ 'src/b.ts': toFactory ? factory : plain })
    expect(server.errors).toEqual([])
    return output()
  }

  // The compiler registers `src/b.ts` as a dependency (`addDependency`) only
  // of the module it first loads it for; the other importers depend on it in
  // Rspack because the compiler resolves the whole import chain from each
  // importer (the loader's `resolve()` records the files it resolves).
  // Source: gap DV27 (gaps/dev-hmr.md), suspected bug not reproduced.
  test.each(['./b', './c'])(
    'client: every module importing a factory from %s that becomes one loads no server code',
    async (importFrom) => {
      expect(await editFactory(importFrom, true)).not.toContain(
        'MARK_DB_SECRET',
      )
    },
    timeout,
  )

  test.each(['./b', './c'])(
    'client: every module importing a factory from %s that stops being one keeps its handler',
    async (importFrom) => {
      // Both handlers call `db.x()`
      expect(
        (await editFactory(importFrom, false)).match(/\bdb\.x\(\)/g),
      ).toHaveLength(2)
    },
    timeout,
  )
})

describe('Rsbuild dev: server fn ids', () => {
  // Server fns are called by id: two server fns sharing an id would run
  // each other's handler.
  // Source: mutation round 3 sc-hosts 2.
  test(
    'same-named server fns of two modules get different ids',
    async () => {
      const fn = `import { createServerFn } from '@tanstack/react-start'
export const getData = createServerFn().handler(async () => 'x')
`
      const server = await startRsbuildDevServer({
        files: {
          'src/a.ts': fn,
          'src/b.ts': fn,
          'src/entry.ts': `import { getData as a } from './a'
import { getData as b } from './b'
;(globalThis as Record<string, unknown>).ids = [a.functionId, b.functionId]
`,
        },
      })
      // The client bundle (one chunk) runs in a bare context
      const context = vm.createContext({})
      context.self = context
      for (const code of Object.values(await server.outputs())) {
        vm.runInContext(code, context)
      }
      const ids = context.ids as Array<unknown>
      expect(ids).toEqual([expect.any(String), expect.any(String)])
      expect(ids[0]).not.toBe(ids[1])
    },
    timeout,
  )
})
