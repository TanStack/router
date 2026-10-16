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

describe('rewriteDeniedImports', () => {
  test('skips type-only import declaration', () => {
    const result = rewriteDeniedImports(
      `import type { Foo } from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
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

  test('returns undefined when no denied imports are found', () => {
    const result = rewriteDeniedImports(
      `import { ok } from './safe';\nimport { also } from './fine';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
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

  test('skips type-only export declaration', () => {
    const result = rewriteDeniedImports(
      `export type { Foo } from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

  test('skips type-only export * from denied', () => {
    const result = rewriteDeniedImports(
      `export type * from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

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

  // Bug: the rewrite names the import of the mock `__tss_deny_<n>` without
  // checking the names the module declares.
  // Impact: once one of its imports is denied, a module that declares such a
  // name fails to compile (duplicate declaration), or, when a TypeScript
  // transform elides the shadowed import (as here), reads its own binding
  // instead of the mock.
  // Source: PR #8504 (rewrite.test.ts "does not reuse a name the module
  // declares for the mock import"), found by mutation testing.
  test.fails(
    'a module declaring the name of the mock import evaluates',
    async () => {
      const { module } = await evaluateRewritten(
        `const __tss_deny_0 = 'mine'
import { foo } from './secret.server'
export const both = [foo, __tss_deny_0]`,
        ['./secret.server'],
      )
      expect(module.both).toEqual(['mock:foo', 'mine'])
    },
  )
})
