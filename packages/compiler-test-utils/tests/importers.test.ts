/**
 * Controls of the importer and load probes (importers.ts), linked by the
 * module linker as real ES modules: an importer gets the instance the
 * module uses (named, default and non-identifier exports, live bindings),
 * and load markers record exactly the modules that evaluated.
 */
import { afterEach, describe, expect, test } from 'vitest'
import {
  expectNotLoaded,
  importBindings,
  importerSource,
  loadMarker,
  loadedModules,
  loadedModulesExpression,
  resetLoadedModules,
} from '../src/importers'
import { createModuleGraph } from '../src/module-linker'

afterEach(() => {
  resetLoadedModules()
})

describe('importBindings', () => {
  test('a second module gets the instance the module itself uses, live', async () => {
    const graph = createModuleGraph({
      modules: {
        '/route.tsx': `export const store = { count: 0 }
export let version = 1
export function bump() { version++ }
const Page = () => store
export default Page
const odd = 'odd'
export { odd as 'not-an-identifier' }
export const Route = { component: Page, store }
`,
      },
    })
    const route = await graph.import('/route.tsx')
    const bindings = await importBindings(graph, './route', [
      'store',
      'default',
      'version',
      'bump',
      'not-an-identifier',
    ])
    expect(bindings.store).toBe(route.Route.store)
    expect(bindings.default).toBe(route.Route.component)
    expect(bindings['not-an-identifier']).toBe('odd')
    bindings.bump()
    expect(bindings.version).toBe(2)
  })

  test('an import of a missing export fails to link, as in a bundle', async () => {
    const graph = createModuleGraph({
      modules: { '/route.tsx': `export const Route = {}` },
    })
    await expect(
      importBindings(graph, './route', ['missing']),
    ).rejects.toThrow()
  })

  test('importerSource is a plain module any real app can contain', () => {
    expect(importerSource('./route', ['Route'])).toContain(`from "./route"`)
  })
})

describe('load markers', () => {
  test('record exactly the modules that evaluated, in order', async () => {
    const graph = createModuleGraph({
      modules: {
        '/entry.ts': `import './eager'
export const later = () => import('./lazy')
`,
        '/eager.ts': `${loadMarker('eager')}export {}`,
        '/lazy.ts': `${loadMarker('lazy')}export {}`,
      },
      stubs: {
        './db.server': `${loadMarker('db.server')}export const db = 1`,
      },
    })
    const entry = await graph.import('/entry.ts')
    expect(loadedModules()).toEqual(['eager'])
    expectNotLoaded(loadedModules(), ['lazy', 'db.server'])
    expectNotLoaded(graph.evaluated, ['/lazy.ts'])
    await entry.later()
    expect(loadedModules()).toEqual(['eager', 'lazy'])
    expect(() => expectNotLoaded(loadedModules(), ['lazy'])).toThrow()
  })

  test('loadedModulesExpression reads the records in any realm', () => {
    const read = new Function(`return ${loadedModulesExpression}`) as () => [
      string,
    ]
    expect(read()).toEqual([])
    new Function(loadMarker('x'))()
    expect(read()).toEqual(['x'])
  })
})
