/**
 * Controls of the module linker: modules link like ES modules in a bundle
 * (every import and export form, live bindings, cycles), a dynamic import
 * evaluates its module only when it runs, and every graph evaluates fresh
 * module instances; real packages, JSX, the load observers and forks.
 */
import path from 'node:path'
import { describe, expect, it, test } from 'vitest'
import { createModuleGraph } from '../src/module-linker'
import type { ModuleStub } from '../src/module-linker'

/** Evaluates `code` as the only module of a new graph. */
function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  options: { importMeta?: Record<string, unknown> } = {},
): Promise<Record<string, any>> {
  const id = '/module.tsx'
  return createModuleGraph({
    modules: { [id]: code },
    stubs,
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  }).import(id)
}

describe('evaluateModule', () => {
  test('links every import and export form as ES modules', async () => {
    const module = await evaluateModule(
      `import def, { named as alias, 'string name' as str } from './dep'
import * as ns from './dep'
import config from './config.json' with { type: 'json' }
export { named, 'string name' as 'other name' } from './dep'
export * from './star'
export * as starNs from './star'
export default function () {
  return [def, alias, str, ns.named, config.theme].join()
}`,
      {
        './dep': { default: 'D', named: 'N', 'string name': 'S' },
        './star': `export const starred = 1`,
        './config.json': `{ "theme": "dark" }`,
      },
    )
    expect(module.default()).toBe('D,N,S,N,dark')
    expect([
      module.named,
      module['other name'],
      module.starred,
      module.starNs.starred,
    ]).toEqual(['N', 'S', 1, 1])
  })

  test('evaluates a module starting with a hashbang', async () => {
    const module = await evaluateModule(
      `#!/usr/bin/env node
export const value = import.meta.flag + 1`,
      {},
      { importMeta: { flag: 1 } },
    )
    expect(module.value).toBe(2)
  })

  test('exports are live bindings', async () => {
    const module = await evaluateModule(`export let count = 0
export function bump() { count++ }`)
    module.bump()
    expect(module.count).toBe(1)
  })

  test('an import of an unknown module, or of a name a stub lacks, fails to link', async () => {
    await expect(
      evaluateModule(`import { x } from './missing'\nexport const y = x`),
    ).rejects.toThrow('No stub for import ./missing')
    await expect(
      evaluateModule(`import { other } from './dep'\nexport const y = other`, {
        './dep': { x: 1 },
      }),
    ).rejects.toThrow(/other/)
  })

  test('a dynamic import resolves when it runs, and fails then if unknown', async () => {
    const module = await evaluateModule(
      `export const load = () => import('./dep')
export const loadMissing = () => import('./missing')`,
      { './dep': { x: 1 } },
    )
    expect((await module.load()).x).toBe(1)
    await expect(module.loadMissing()).rejects.toThrow(
      'No stub for import ./missing',
    )
  })

  // Route files of apps live at paths such as `routes/{-$locale}/index.tsx`.
  test('a dynamic import of a static specifier containing $ resolves', async () => {
    const module = await evaluateModule(
      `export const quoted = () => import('./{-$locale}/dep')
export const template = () => import(\`./{-$locale}/dep\`)`,
      { './{-$locale}/dep': { x: 1 } },
    )
    expect([(await module.quoted()).x, (await module.template()).x]).toEqual([
      1, 1,
    ])
  })
})

describe('evaluateModule links every import form like an ES module runtime', () => {
  it('links default, named, namespace and side-effect imports', async () => {
    const { read } = await evaluateModule(
      `import './effects'
import fallback, { value as renamed } from './lib'
import * as lib from './lib'
export const read = () => [fallback, renamed, lib.value, lib.default].join()`,
      {
        './effects': {},
        './lib': { default: 'default', value: 'value' },
      },
    )
    expect(read!()).toBe('default,value,value,default')
  })

  it('links re-exports', async () => {
    const module = await evaluateModule(
      `export * from './lib'
export { value as renamed, default as fallback } from './lib'`,
      { './lib': { default: 'default', value: 'value' } },
    )
    expect({ ...module }).toEqual({
      fallback: 'default',
      renamed: 'value',
      value: 'value',
    })
  })

  it('rejects an import of a name the module does not export', async () => {
    await expect(
      evaluateModule(`import { missing } from './lib'\nexport { missing }`, {
        './lib': { value: 1 },
      }),
    ).rejects.toThrow("does not provide an export named 'missing'")
  })

  it('assigns import.meta properties before the module runs', async () => {
    const hot = { data: {} }
    const { read } = await evaluateModule(
      `const seen = import.meta.hot\nexport const read = () => seen`,
      {},
      { importMeta: { hot } },
    )
    expect(read!()).toBe(hot)
  })
})

describe('module sessions', () => {
  const modules: Record<string, string> = {
    '/a.tsx': `import { count, increment } from '/b.tsx'
export const read = () => count
export { increment }
export const lazy = () => import('/c.tsx')`,
    '/b.tsx': `export let count = 0\nexport function increment() { count++ }`,
    '/c.tsx': `export const loaded = { module: 'c' }`,
  }
  const resolve = (specifier: string) =>
    specifier in modules ? specifier : undefined

  it('keeps imports live bindings', async () => {
    const session = createModuleGraph({ modules, resolve })
    const a = await session.import('/a.tsx')
    a.increment()
    a.increment()
    expect(a.read()).toBe(2)
  })

  it('evaluates a dynamically imported module only when it is imported', async () => {
    const session = createModuleGraph({ modules, resolve })
    const a = await session.import('/a.tsx')
    expect([...session.evaluated]).toEqual(['/b.tsx', '/a.tsx'])
    expect((await a.lazy()).loaded).toEqual({ module: 'c' })
    expect([...session.evaluated]).toEqual(['/b.tsx', '/a.tsx', '/c.tsx'])
  })

  it('evaluates fresh module instances in every session', async () => {
    const first = await createModuleGraph({ modules, resolve }).import('/a.tsx')
    first.increment()
    const second = await createModuleGraph({ modules, resolve }).import(
      '/a.tsx',
    )
    expect([first.read(), second.read()]).toEqual([1, 0])
  })
})

// Vite erases TypeScript this way in a project with `verbatimModuleSyntax`:
// an unused value import still loads its module, and so does an import of
// `type` specifiers only (as `import './x'`); an `import type` does not.
describe('TypeScript erasure keeps every value import', () => {
  it('evaluates a module imported but never used, and not one imported with import type', async () => {
    const modules: Record<string, string> = {
      '/entry.ts': `import { unused } from '/unused.ts'
import type { Shape } from '/types.ts'
import { type Other } from '/specifier.ts'
export const value: Shape = { key: 'entry' }`,
      '/unused.ts': `export const unused = 'unused'`,
      '/types.ts': `export interface Shape { key: string }`,
      '/specifier.ts': `export interface Other {}`,
    }
    const graph = createModuleGraph({
      modules,
      resolve: (specifier) => (specifier in modules ? specifier : undefined),
    })
    expect((await graph.import('/entry.ts')).value).toEqual({ key: 'entry' })
    expect([...graph.evaluated].sort()).toEqual([
      '/entry.ts',
      '/specifier.ts',
      '/unused.ts',
    ])
  })

  it('without verbatimModuleSyntax, drops the imports nothing reads', async () => {
    const modules: Record<string, string> = {
      '/entry.ts': `import { unused } from '/unused.ts'
import { type Other } from '/specifier.ts'
export const value = 'entry'`,
      '/unused.ts': `export const unused = 'unused'`,
      '/specifier.ts': `export interface Other {}`,
    }
    const graph = createModuleGraph({
      modules,
      resolve: (specifier) => (specifier in modules ? specifier : undefined),
      verbatimModuleSyntax: false,
    })
    expect((await graph.import('/entry.ts')).value).toBe('entry')
    expect([...graph.evaluated]).toEqual(['/entry.ts'])
  })
})

describe('cycles', () => {
  const graphOf = (modules: Record<string, string>) =>
    createModuleGraph({
      modules,
      resolve: (specifier) => (specifier in modules ? specifier : undefined),
    })

  it('links a cycle with live bindings, evaluating the imported module first', async () => {
    const graph = graphOf({
      '/a.tsx': `import { b, readA, callA } from '/b.tsx'
export const a = 'A'
export function hoisted() { return 'hoisted' }
export const read = () => [b, readA(), callA]`,
      // A function declaration of a module in the cycle is initialised before
      // any module of the cycle runs.
      '/b.tsx': `import { a, hoisted } from '/a.tsx'
export const b = 'B'
export const readA = () => a
export const callA = hoisted()`,
    })
    const a = await graph.import('/a.tsx')
    expect(a.read()).toEqual(['B', 'A', 'hoisted'])
    expect([...graph.evaluated]).toEqual(['/b.tsx', '/a.tsx'])
  })

  it('a module of a cycle that reads a binding before its module initialised it throws a ReferenceError (TDZ)', async () => {
    const graph = graphOf({
      '/a.tsx': `import { b } from '/b.tsx'
export const a = 'A'
export const read = () => b`,
      '/b.tsx': `import { a } from '/a.tsx'
export const b = a`,
    })
    await expect(graph.import('/a.tsx')).rejects.toThrow(
      expect.objectContaining({
        name: 'ReferenceError',
        message: expect.stringMatching(/before initialization/),
      }),
    )
  })
})

describe('fallbackStub', () => {
  // Like one module of a bundle, a stubbed package is one instance for every
  // module that imports it.
  it('gives every importer of a specifier the same stub values, and the names each imports', async () => {
    const calls: Array<Array<string>> = []
    const modules: Record<string, string> = {
      '/entry.tsx': `export { fromA } from '/a.tsx'
export { fromB, other } from '/b.tsx'`,
      '/a.tsx': `import { createStore } from 'store-lib'
export const fromA = createStore`,
      '/b.tsx': `import { createStore, other } from 'store-lib'
export const fromB = createStore
export { other }`,
    }
    const graph = createModuleGraph({
      modules,
      resolve: (specifier) => (specifier in modules ? specifier : undefined),
      fallbackStub: (_, names) => {
        calls.push([...names])
        return Object.fromEntries(
          [...names].map((name) => [name, { stubbed: name }]),
        )
      },
    })
    const entry = await graph.import('/entry.tsx')
    expect(entry.fromA).toEqual({ stubbed: 'createStore' })
    expect(entry.fromA).toBe(entry.fromB)
    expect(entry.other).toEqual({ stubbed: 'other' })
    // Called again only for the name the first importer did not import
    expect(calls).toEqual([['createStore'], ['other']])
  })
})

// The package's own directory: its dependencies are the real packages a
// graph can link (`globals` is a CommonJS package, `vite` an ES one).
const packageDirectory = path.join(import.meta.dirname, '..')

describe('packages', () => {
  it('links a bare specifier to the real package, one instance for every graph and for importPackage', async () => {
    const modules = {
      '/a.ts': `import globals from 'globals'
import { version } from 'vite'
export { globals, version }`,
    }
    const first = createModuleGraph({ modules, packages: packageDirectory })
    const second = createModuleGraph({ modules, packages: packageDirectory })
    const [a, b] = [await first.import('/a.ts'), await second.import('/a.ts')]
    const real = await first.importPackage('globals')
    expect(Object.keys(a.globals)).toContain('browser')
    expect(a.globals).toBe(real.default)
    expect(b.globals).toBe(real.default)
    expect(a.version).toBe((await second.importPackage('vite')).version)
  })

  it('stubs win over packages, and a specifier no package provides goes to fallbackStub', async () => {
    const graph = createModuleGraph({
      modules: {
        '/a.ts': `export { default as globals } from 'globals'
export { missing } from 'not-installed-package'`,
      },
      packages: packageDirectory,
      stubs: { globals: { default: 'stubbed' } },
      fallbackStub: (_, names) =>
        Object.fromEntries(
          [...names].map((name) => [name, `fallback ${name}`]),
        ),
    })
    expect({ ...(await graph.import('/a.ts')) }).toEqual({
      globals: 'stubbed',
      missing: 'fallback missing',
    })
  })

  it('without a fallback, an import of a package that does not resolve fails to link', async () => {
    const graph = createModuleGraph({
      modules: { '/a.ts': `import 'not-installed-package'` },
      packages: packageDirectory,
    })
    await expect(graph.import('/a.ts')).rejects.toThrow(/not-installed-package/)
  })
})

describe('JSX', () => {
  // A control of how the default transform compiles JSX, with a stub that
  // records the calls (no renderer): React's automatic runtime, as
  // `@vitejs/plugin-react` compiles it.
  it('compiles to calls of the automatic runtime of jsxImportSource (default react)', async () => {
    const runtime = {
      jsx: (type: unknown, props: unknown) => ({ type, props }),
      jsxs: (type: unknown, props: unknown) => ({ type, props, static: true }),
      Fragment: 'Fragment',
    }
    const code = `export const element = <p id="x">{'a'}</p>
export const fragment = <><i /><b /></>`
    const react = await createModuleGraph({
      modules: { '/a.tsx': code },
      stubs: { 'react/jsx-runtime': runtime },
    }).import('/a.tsx')
    expect(react.element).toEqual({
      type: 'p',
      props: { id: 'x', children: 'a' },
    })
    expect(react.fragment).toEqual({
      type: 'Fragment',
      props: {
        children: [
          { type: 'i', props: {} },
          { type: 'b', props: {} },
        ],
      },
      static: true,
    })
    const other = await createModuleGraph({
      modules: { '/a.tsx': code },
      jsxImportSource: 'other',
      stubs: { 'other/jsx-runtime': runtime },
    }).import('/a.tsx')
    expect(other.element).toEqual(react.element)
  })
})

describe('requested', () => {
  const modules: Record<string, string> = {
    '/route.tsx': `import { helper } from '/shared.tsx'
import { value } from 'lib'
export const read = () => [helper, value]
export const lazy = () => import('/chunk.tsx')`,
    '/shared.tsx': `import 'side-effect'
export const helper = 'helper'`,
    '/chunk.tsx': `import { helper } from '/shared.tsx'
import { other } from 'lib'
export const chunk = [helper, other]`,
  }
  const resolve = (specifier: string) =>
    specifier in modules ? specifier : undefined
  const stubs = { lib: { value: 'value', other: 'other' }, 'side-effect': {} }

  it('records each module the graph requests once: static imports when they link, dynamic ones when they run', async () => {
    const graph = createModuleGraph({ modules, resolve, stubs })
    const route = await graph.import('/route.tsx')
    const eager = ['/shared.tsx', 'lib', 'side-effect']
    expect([...graph.requested].sort()).toEqual(eager)
    expect((await route.lazy()).chunk).toEqual(['helper', 'other'])
    expect([...graph.requested].sort()).toEqual(['/chunk.tsx', ...eager])
  })

  it('names packages by their specifier, and not what importPackage loads', async () => {
    const graph = createModuleGraph({
      modules: { '/a.ts': `export { default } from 'globals'` },
      packages: packageDirectory,
    })
    await graph.importPackage('vite')
    await graph.import('/a.ts')
    expect(graph.requested).toEqual(['globals'])
  })
})

describe('fork', () => {
  it('evaluates the same modules, added ones included, as fresh instances with the same stubs', async () => {
    const counter = { count: 0 }
    const graph = createModuleGraph({
      modules: {
        '/a.ts': `import { counter } from 'counter'
export let own = 0
export const bump = () => [++own, ++counter.count]`,
      },
      stubs: { counter: { counter } },
    })
    graph.add('/b.ts', `export { bump } from '/a.ts'`)
    const first = await graph.import('/b.ts')
    first.bump()
    const fork = graph.fork()
    const forked = await fork.import('/b.ts')
    expect(forked.bump()).toEqual([1, 2])
    expect([...fork.evaluated]).toEqual(['/a.ts', '/b.ts'])
    expect([...graph.evaluated]).toEqual(['/a.ts', '/b.ts'])
  })
})
