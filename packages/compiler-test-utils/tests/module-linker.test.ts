/**
 * Controls of the module linker: modules link like ES modules in a bundle
 * (every import and export form, live bindings, cycles), a dynamic import
 * evaluates its module only when it runs, and every graph evaluates fresh
 * module instances.
 */
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
    '/c.tsx': `export const loaded = <p>c</p>`,
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
    expect((await a.lazy()).loaded).toBe('<p>c</p>')
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
