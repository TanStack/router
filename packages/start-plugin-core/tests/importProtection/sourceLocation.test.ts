/**
 * Compiler-level outcomes of import protection's location lookup (SPEC §8
 * allows them, V1 ip R01): which original use of a denied import is
 * reported, skipping uses inside code the Start compiler removes from the
 * environment, and positions through a real source map. Its internals
 * (caches, indexes, snippets) are internal controls:
 * outside-compiler-corpus/importProtection/sourceLocation.test.ts.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  ImportLocCache,
  addTraceImportLocations,
  createImportSpecifierLocationIndex,
  findImportStatementLocationFromTransformed,
  findOriginalUsageLocation,
  findPostCompileUsageLocation,
} from '../../src/import-protection/sourceLocation'
import type {
  TransformResult,
  TransformResultProvider,
} from '../../src/import-protection/sourceLocation'

describe('findOriginalUsageLocation', () => {
  function makeProvider(
    code: string,
    originalCode?: string,
  ): TransformResultProvider {
    return {
      getTransformResult: () => ({
        code,
        map: undefined,
        originalCode,
      }),
    }
  }

  test('prefers original usage site over import site when original code is available', () => {
    const provider = makeProvider(
      'const secretServerFn = createServerFn().handler(rpc())\n',
      [
        "import { createServerFn } from '@tanstack/react-start'",
        "import { getSecret } from './secret.server'",
        '',
        'export const secretServerFn = createServerFn().handler(async () => {',
        '  return getSecret()',
        '})',
        '',
        'export function leakyReference() {',
        '  return getSecret()',
        '}',
      ].join('\n'),
    )

    expect(
      findOriginalUsageLocation(
        provider,
        '/test/compiler-leak.ts',
        './secret.server',
        'client',
      ),
    ).toEqual({
      file: '/test/compiler-leak.ts',
      line: 9,
      column: 10,
    })
  })

  test('returns undefined when original usage only exists inside compiler-safe boundary', () => {
    const provider = makeProvider(
      'export const safe = noop\n',
      [
        "import { createServerOnlyFn } from '@tanstack/react-start'",
        "import { getSecret } from './secret.server'",
        '',
        'export const safe = createServerOnlyFn(() => {',
        '  return getSecret()',
        '})',
      ].join('\n'),
    )

    expect(
      findOriginalUsageLocation(
        provider,
        '/test/boundary-safe.ts',
        './secret.server',
        'client',
      ),
    ).toBeUndefined()
  })

  // Each case has a use inside a boundary the compiler strips from `env`
  // (skipped), then a look-alike use that is not one (reported).
  const imports = `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
import { getSecret } from './secret.server'
`
  test.each([
    {
      name: 'createServerOnlyFn, then an ordinary callback',
      env: 'client',
      body: `export const a = createServerOnlyFn(() => getSecret())
export const b = run(() => getSecret())`,
      line: 4,
    },
    {
      name: 'createClientOnlyFn, then an ordinary callback',
      env: 'server',
      body: `export const a = createClientOnlyFn(() => getSecret())
export const b = run(() => getSecret())`,
      line: 4,
    },
    {
      name: 'createIsomorphicFn().client, then .server',
      env: 'server',
      body: `export const a = createIsomorphicFn().client(() => getSecret())
export const b = createIsomorphicFn().server(() => getSecret())`,
      line: 4,
    },
    {
      name: 'createIsomorphicFn().server, then .client',
      env: 'client',
      body: `export const a = createIsomorphicFn().server(() => getSecret())
export const b = createIsomorphicFn().client(() => getSecret())`,
      line: 4,
    },
    {
      name: 'createIsomorphicFn().server, then a nested member call',
      env: 'client',
      body: `export const a = createIsomorphicFn().server(() => getSecret())
export const b = api.helpers.run(() => getSecret())`,
      line: 4,
    },
    {
      name: 'createMiddleware().server, then another .server method',
      env: 'client',
      body: `export const a = createMiddleware().server(() => getSecret())
export const b = api.server(() => getSecret())`,
      line: 4,
    },
    {
      name: 'a middleware variable, then a .handler method',
      env: 'client',
      body: `const authMiddleware = createMiddleware()
export const a = authMiddleware.server(() => getSecret())
export const b = queue.handler(() => getSecret())`,
      line: 5,
    },
    {
      name: 'a server fn builder variable, then an ordinary callback',
      env: 'client',
      body: `const myServerFn = createServerFn()
export const a = myServerFn.handler(() => getSecret())
export const b = run(() => getSecret())`,
      line: 5,
    },
    {
      name: 'a catch clause in a handler, then an ordinary callback',
      env: 'client',
      body: `export const a = createServerFn().handler(() => { try { return 1 } catch { return getSecret() } })
export const b = run(() => getSecret())`,
      line: 4,
    },
    {
      name: 'a callback of a returned function',
      env: 'client',
      body: `export const a = getRunner()(() => getSecret())`,
      line: 3,
    },
    {
      name: 'a method of a constructed object',
      env: 'client',
      body: `export const a = new Api().run(() => getSecret())`,
      line: 3,
    },
    // Source: mutation run R3c (the rest of the ip-analysis "Rsbuild
    // original-source usage lookup" cluster).
    {
      name: 'an immediately invoked function',
      env: 'client',
      body: `export const a = (() => getSecret())()`,
      line: 3,
    },
    {
      name: 'a callback of a private method',
      env: 'client',
      body: `export class Api { #run(fn: () => unknown) { return fn() } go() { return this.#run(() => getSecret()) } }`,
      line: 3,
    },
    {
      name: 'a .handler of a callee whose name only contains ServerFn',
      env: 'client',
      body: `export const a = ServerFnRegistry.handler(() => getSecret())`,
      line: 3,
    },
    {
      name: 'a .server of a callee whose name only contains Middleware',
      env: 'client',
      body: `export const a = MiddlewareRegistry.server(() => getSecret())`,
      line: 3,
    },
    {
      name: 'createIsomorphicFn().client, then another .client method',
      env: 'server',
      body: `export const a = createIsomorphicFn().client(() => getSecret())
export const b = api.client(() => getSecret())`,
      line: 4,
    },
    {
      name: 'loops in createServerOnlyFn, then an ordinary callback',
      env: 'client',
      body: `export const a = createServerOnlyFn(() => { for (const i of [1]) { getSecret() } for (let i = 0; i < 1; i++) { getSecret() } })
export const b = run(() => getSecret())`,
      line: 4,
    },
  ] as const)('$env: $name', ({ env, body, line }) => {
    const provider = makeProvider('export {}\n', imports + body)
    expect(
      findOriginalUsageLocation(
        provider,
        '/test/src/a.ts',
        './secret.server',
        env,
      )?.line,
    ).toBe(line)
  })

  // Source: mutation run R3c (spc:326, 328).
  test('a type-only import specifier is not a use', () => {
    const code = `import { createServerFn } from '@tanstack/react-start'
import { type Secret, getSecret } from './secret.server'
export const v: Secret = 1 as any
export const leak = getSecret`
    const provider = makeProvider('export {}\n', code)
    expect(
      findOriginalUsageLocation(
        provider,
        '/test/src/a.ts',
        './secret.server',
        'client',
      )?.line,
    ).toBe(4)
  })
})

describe('locations through a real source map', () => {
  const file = '/root/src/page.tsx'
  // Multi-byte characters before the import shift every generated column.
  const original = `// ünïcödé 👨‍👩‍👧 comment
import type { Shape } from './types'
import { getSecret } from './secret.server'
interface Props { shape: Shape }
export const Page = ({ shape }: Props) => <div title="é">{getSecret(shape)}</div>
`

  const importLocation = {
    file,
    line: 3,
    column: original.split('\n')[2]!.indexOf("'./secret.server'") + 1,
  }

  async function createProvider(): Promise<TransformResultProvider> {
    const output = await transformWithOxc(original, file, {
      jsx: 'preserve',
      sourcemap: true,
    })
    const result: TransformResult = {
      code: output.code,
      map: {
        ...output.map!,
        file: undefined,
        sourceRoot: '/root/',
        sources: ['src/page.tsx'],
        sourcesContent: [original],
      },
      originalCode: undefined,
      filename: file,
    }
    return { getTransformResult: () => result }
  }

  function findSpecifier() {
    const index = createImportSpecifierLocationIndex()
    return (result: TransformResult, source: string) =>
      index.find(result, source)
  }

  test('import and usage locations map back to the original source', async () => {
    const provider = await createProvider()
    expect(
      await findImportStatementLocationFromTransformed(
        provider,
        file,
        './secret.server',
        new ImportLocCache(),
        findSpecifier(),
      ),
    ).toEqual(importLocation)
    const usageLine = original.split('\n')[4]!
    const usage = { file, line: 5, column: usageLine.indexOf('getSecret(') + 1 }
    expect(
      await findPostCompileUsageLocation(provider, file, './secret.server'),
    ).toEqual(usage)
    expect(
      findOriginalUsageLocation(
        provider,
        file,
        './secret.server',
        'client',
        '/root',
      ),
    ).toEqual(usage)
  })

  test('trace steps that import a specifier get the original import line', async () => {
    const provider = await createProvider()
    const trace: Array<{
      file: string
      specifier?: string
      line?: number
      column?: number
    }> = [
      { file: '/root/src/entry.tsx' },
      { file, specifier: './secret.server' },
      // A second lookup of the same specifier exercises the cache-hit path.
      { file, specifier: './secret.server' },
      { file, specifier: './types', line: 1, column: 1 },
    ]
    await addTraceImportLocations(
      provider,
      trace,
      new ImportLocCache(),
      findSpecifier(),
    )
    expect(trace).toEqual([
      { file: '/root/src/entry.tsx' },
      { specifier: './secret.server', ...importLocation },
      { specifier: './secret.server', ...importLocation },
      { file, specifier: './types', line: 1, column: 1 },
    ])
  })
})
