/**
 * Controls of the lazy-loading probe on fixed graphs: laziness, loaded
 * modules and groups are observed by the modules evaluated when the real
 * trigger completes, whatever builds the lazy value (a wrapper awaiting
 * something first, a dynamic facade), and without loading anything in the
 * graph a test inspects.
 */
import { describe, expect, it } from 'vitest'
import { createLazyProbe } from '../src/lazy-probe'
import { createModuleGraph } from '../src/module-linker'

/** A graph whose modules import each other by id. */
function graphOf(modules: Record<string, string>, stubs = {}) {
  return createModuleGraph({
    modules,
    stubs,
    resolve: (specifier) => (specifier in modules ? specifier : undefined),
  })
}

/** Triggers starting to load each export of the entry: `load()` or `preload()`. */
const triggers = Object.fromEntries(
  ['a', 'b', 'c', 'd', 'eager'].map((name) => [
    name,
    (exports: Record<string, any>) =>
      exports[name]?.preload?.() ?? exports[name]?.load?.(),
  ]),
)

describe('createLazyProbe', () => {
  it('tells lazy values from eager ones and the modules loading one evaluates', async () => {
    const graph = graphOf(
      {
        '/entry.ts': `import { shared } from '/shared.ts'
export const eager = { load: () => shared }
// An equivalent wrapper of its own
export const a = { preload: () => import('/a.ts').then((m) => m.value) }
// An intermediate module loading the group's modules
export const b = { load: async () => (await import('/group.ts')).b }
export const c = { load: async () => (await import('/group.ts')).c }`,
        '/shared.ts': `export const shared = 'shared'`,
        '/a.ts': `import 'lib'
export const value = 'a'`,
        '/group.ts': `export { b } from '/b.ts'
export { c } from '/c.ts'`,
        '/b.ts': `export const b = 'b'`,
        '/c.ts': `export const c = 'c'`,
      },
      { lib: {} },
    )
    await graph.import('/entry.ts')
    const probe = createLazyProbe(graph, '/entry.ts', triggers)
    expect(
      await Promise.all(['eager', 'a', 'b', 'c'].map(probe.isLazy)),
    ).toEqual([false, true, true, true])
    // Stubs and packages are not the graph's modules.
    expect(await probe.loadedBy('a')).toEqual(['/a.ts'])
    expect((await probe.loadedBy('b')).sort()).toEqual([
      '/b.ts',
      '/c.ts',
      '/group.ts',
    ])
    expect(await probe.groups(['eager', 'a', 'b', 'c'])).toEqual([
      ['a'],
      ['b', 'c'],
    ])
    // The graph itself loaded nothing more.
    expect([...graph.evaluated]).toEqual(['/shared.ts', '/entry.ts'])
  })

  it('shows a group that loads another one with it', async () => {
    const graph = graphOf({
      '/entry.ts': `export const a = { load: () => import('/a.ts') }
export const b = { load: () => import('/b.ts') }`,
      '/a.ts': `import '/b.ts'`,
      '/b.ts': `export {}`,
    })
    const probe = createLazyProbe(graph, '/entry.ts', triggers)
    expect(await probe.groups(['a', 'b'])).toEqual([['a', 'b'], ['b']])
  })

  it('awaits the trigger: a wrapper that awaits first, a dynamic facade and an unawaited import are lazy, with every module they load', async () => {
    const graph = graphOf({
      '/entry.ts': `// Awaits something else before importing
export const a = {
  preload: async () => {
    await Promise.resolve()
    return import('/a.ts')
  },
}
// A facade module that loads the value's module itself
export const b = { load: () => import('/facade.ts').then((m) => m.load()) }
// Starts the import without returning it
export const c = {
  preload: () => {
    void import('/c.ts')
  },
}
export const eager = { load: async () => { await Promise.resolve(); return 'eager' } }`,
      '/a.ts': `export const a = 'a'`,
      '/facade.ts': `export const load = () => import('/b.ts')`,
      '/b.ts': `export const b = 'b'`,
      '/c.ts': `export const c = 'c'`,
    })
    await graph.import('/entry.ts')
    const probe = createLazyProbe(graph, '/entry.ts', triggers)
    expect(
      await Promise.all(['a', 'b', 'c', 'eager'].map(probe.isLazy)),
    ).toEqual([true, true, true, false])
    expect(await probe.loadedBy('a')).toEqual(['/a.ts'])
    expect(await probe.loadedBy('b')).toEqual(['/facade.ts', '/b.ts'])
    expect(await probe.loadedBy('c')).toEqual(['/c.ts'])
    expect(await probe.groups(['a', 'b', 'c', 'eager'])).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ])
    expect([...graph.evaluated]).toEqual(['/entry.ts'])
  })

  it('observes each pair of a group on its own: what one name loads does not make another available', async () => {
    const graph = graphOf({
      '/entry.ts': `export const a = { load: () => import('/a.ts') }
// b and c load the same module (one group); d shares only a support module
export const b = { load: () => import('/bc.ts').then((m) => m.b) }
export const c = { load: async () => (await import('/bc.ts')).c }
export const d = { load: () => import('/d.ts') }`,
      '/a.ts': `import '/d.ts'
export const a = 'a'`,
      '/bc.ts': `import '/support.ts'
export const b = 'b'
export const c = 'c'`,
      '/d.ts': `import '/support.ts'
export const d = 'd'`,
      '/support.ts': `export const support = 'support'`,
    })
    const probe = createLazyProbe(graph, '/entry.ts', triggers)
    // a pulls d in: once a loaded, d is available, not the reverse; b and c
    // are available after each other, whatever else loaded before.
    expect(await probe.groups(['a', 'b', 'c', 'd'])).toEqual([
      ['a', 'd'],
      ['b', 'c'],
      ['d'],
    ])
    expect([...graph.evaluated]).toEqual([])
  })
})
