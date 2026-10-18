import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { SourceMapConsumer } from 'source-map'
import { describe, expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import type { RawSourceMap } from 'source-map'

/** A mock whose members are `<prefix><name>`. */
function prefixMock(prefix: string) {
  return new Proxy(
    {},
    {
      get: (_, key) => (typeof key === 'string' ? prefix + key : undefined),
    },
  )
}

/**
 * Rewrites the denied imports of `code` (module `id`) to a mock module per
 * denied source, then evaluates it as a real ES module with the project
 * modules `files`: the mock of each source has the members `mock:<name>`, or
 * those of `mocks[source]`. Returns the module's namespace and the graph.
 */
async function evaluateRewritten(
  code: string,
  denied: Array<string>,
  options: {
    id?: string
    files?: Record<string, string>
    mocks?: Record<string, object>
  } = {},
) {
  const id = options.id ?? '/test/module.ts'
  const rewritten = rewriteDeniedImports(
    code,
    id,
    new Set(denied),
    (source) => `mock-of:${source}`,
  )
  expect(rewritten).toBeDefined()
  const graph = createModuleGraph({
    modules: { ...options.files, [id]: rewritten!.code },
    stubs: Object.fromEntries(
      denied.map((source) => [
        `mock-of:${source}`,
        { default: options.mocks?.[source] ?? prefixMock('mock:') },
      ]),
    ),
  })
  return { module: await graph.import(id), graph }
}

/**
 * Applies the rewrite of the denied imports `denied` to `code` (module
 * `/test/module.ts`), or keeps `code` when there is nothing to rewrite, and
 * evaluates the result with the project modules `files`. Returns the
 * module's namespace and which project modules and mocks were loaded.
 */
async function evaluateAfterRewrite(
  code: string,
  denied: Array<string>,
  files: Record<string, string> = {},
) {
  const id = '/test/module.ts'
  const mocksLoaded: Array<string> = []
  const rewritten = rewriteDeniedImports(
    code,
    id,
    new Set(denied),
    (source) => `mock-of:${source}`,
  )
  const graph = createModuleGraph({
    modules: { ...files, [id]: rewritten?.code ?? code },
    fallbackStub: (specifier) => {
      mocksLoaded.push(specifier)
      return { default: prefixMock('mock:') }
    },
  })
  const module = await graph.import(id)
  return {
    module: { ...module },
    loaded: graph.evaluated.filter((loaded) => loaded !== id),
    mocksLoaded,
  }
}

/** A denied module, listed in `loaded` when it is evaluated. */
const secretServer = { '/test/secret.server.ts': `export const secret = 1` }

describe('rewriteDeniedImports', () => {
  test('a type-only import of a denied module evaluates unchanged', async () => {
    expect(
      await evaluateAfterRewrite(
        `import type { Foo } from './secret.server'
export const value: Foo = 1 as Foo`,
        ['./secret.server'],
        secretServer,
      ),
    ).toMatchObject({ module: { value: 1 }, loaded: [], mocksLoaded: [] })
  })

  // Loosened: the names `export *` re-exports from a denied module are not
  // mocked (see the dev-server goal pin in known-bugs-dev-server.test.ts);
  // the module still evaluates without loading the denied module.
  test('a module with `export * from` a denied module evaluates without it', async () => {
    const { module, graph } = await evaluateRewritten(
      `export * from './secret.server';\nexport const x = 1;`,
      ['./secret.server'],
      { files: { '/test/secret.server.ts': `export const secret = 1` } },
    )
    expect(module.x).toBe(1)
    expect(graph.evaluated).not.toContain('/test/secret.server.ts')
  })

  // Loosened: the namespace itself is pinned in known-bugs.test.ts ("a
  // denied namespace re-export keeps its exported name").
  test('a module with `export * as ns from` a denied module evaluates without it', async () => {
    const { module, loaded } = await evaluateAfterRewrite(
      `export * as ns from './secret.server'
export const x = 1`,
      ['./secret.server'],
      secretServer,
    )
    expect(module.x).toBe(1)
    expect(loaded).toEqual([])
  })

  test('a module without denied imports evaluates unchanged', async () => {
    expect(
      await evaluateAfterRewrite(
        `import { ok } from './safe'
import { also } from './fine'
export const values = [ok, also]`,
        ['./secret.server'],
        {
          '/test/safe.ts': `export const ok = 'ok'`,
          '/test/fine.ts': `export const also = 'also'`,
        },
      ),
    ).toMatchObject({
      module: { values: ['ok', 'also'] },
      loaded: ['/test/safe.ts', '/test/fine.ts'],
      mocksLoaded: [],
    })
  })

  test('imports that are not denied keep their real values', async () => {
    const { module } = await evaluateRewritten(
      `import { safe } from './ok'
import { secret } from './secret.server'
export const values = [safe, secret]`,
      ['./secret.server'],
      { files: { '/test/ok.ts': `export const safe = 'real'` } },
    )
    expect(module.values).toEqual(['real', 'mock:secret'])
  })

  test('each denied source gets its own mock', async () => {
    const { module } = await evaluateRewritten(
      `import { a } from './server-a'
import { b } from './server-b'
export const values = [a, b]`,
      ['./server-a', './server-b'],
      {
        mocks: {
          './server-a': prefixMock('A:'),
          './server-b': prefixMock('B:'),
        },
      },
    )
    expect(module.values).toEqual(['A:a', 'B:b'])
  })

  test('the source map maps code after a rewritten import back to its origin', async () => {
    const result = rewriteDeniedImports(
      `import { foo } from './secret.server'
const unrelated = 1
export const used = foo + unrelated`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    const lines = result!.code.split('\n')
    const line = lines.findIndex((text) => text.includes('used = foo')) + 1
    const consumer = await new SourceMapConsumer(
      result!.map as unknown as RawSourceMap,
    )
    try {
      expect(
        consumer.originalPositionFor({
          line,
          column: lines[line - 1]!.indexOf('foo +'),
        }),
      ).toMatchObject({ line: 3, column: 'export const used = '.length })
    } finally {
      consumer.destroy()
    }
  })

  test.each([
    {
      name: 'export type { … } from',
      reexport: `export type { Foo } from './secret.server'`,
    },
    {
      name: 'export type * from',
      reexport: `export type * from './secret.server'`,
    },
  ])(
    'a type-only $name a denied module evaluates unchanged',
    async ({ reexport }) => {
      expect(
        await evaluateAfterRewrite(
          `${reexport}
export const value = 1`,
          ['./secret.server'],
          secretServer,
        ),
      ).toMatchObject({ module: { value: 1 }, loaded: [], mocksLoaded: [] })
    },
  )

  // Source: TanStack/router#7341. In a `.ts` module, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  test('rewrites a .ts module with angle-bracket type assertions', async () => {
    const { module } = await evaluateRewritten(
      `import { secret } from './secret.server'
const identity = <T>(value: T) => value
export const seen = <string>identity(<unknown>secret)
`,
      ['./secret.server'],
    )
    expect(module.seen).toBe('mock:secret')
  })

  test('rewritten modules evaluate with mock values for every specifier form', async () => {
    const { module } = await evaluateRewritten(
      `import 'denied'
import def, { type T, value, value as renamed, "kebab-name" as kebab } from 'denied' with { type: 'json' }
import * as ns from 'denied'
export { type U, reexported, reexported as aliased, reexported as "string export", "a-b" as ab } from 'denied'
export { default as renamedDefault } from 'denied'
export const seen: T = [def === ns, value, renamed, kebab] as unknown as T
`,
      ['denied'],
    )
    expect({ ...module }).toEqual({
      seen: [true, 'mock:value', 'mock:value', 'mock:kebab-name'],
      reexported: 'mock:reexported',
      aliased: 'mock:reexported',
      'string export': 'mock:reexported',
      ab: 'mock:a-b',
      renamedDefault: 'mock:default',
    })
  })
})
