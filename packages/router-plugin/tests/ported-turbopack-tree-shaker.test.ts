/**
 * Scenarios ported from Turbopack's tree-shaker analyzer fixtures
 * (vercel/next.js `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`,
 * MIT). Turbopack splits a module into one part per export and computes which
 * statements each part needs; here each split route option plays an export,
 * and the tests check that its chunk gets every statement and import it needs.
 */
import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  expectValidModules,
} from './regression-helpers'
import { declarationOf } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

describe('ported Turbopack tree-shaker fixtures: imports each part needs', () => {
  // Source: analyzer/import-with-clause
  it('keeps import attributes on the imports each module receives', async () => {
    const { modules } =
      compileRouteModules(`${head}import data from './data.json' with { type: 'json' }
import meta from './meta.json' with { type: 'json' }
export const Route = createFileRoute('/')({
  loader: () => meta,
  component: () => <p>{data.title}</p>,
})
`)
    expect(modules.reference).toMatch(
      /import meta from ['"]\.\/meta\.json['"] with \{ type: ['"]json['"] \}/,
    )
    expect(modules.reference).not.toContain('data.json')
    expect(modules['virtual component']).toMatch(
      /import data from ['"]\.\/data\.json['"] with \{ type: ['"]json['"] \}/,
    )
    expect(modules['virtual component']).not.toContain('meta.json')
    await expectValidModules(modules)
  })

  // Source: analyzer/typeof-1
  it('treats a typeof operand as a reference to the import', async () => {
    const { modules } =
      compileRouteModules(`${head}import { ClientThing } from './client-thing'
import { ServerThing } from './server-thing'
export const Route = createFileRoute('/')({
  loader: () => typeof ServerThing,
  component: () => <p>{typeof ClientThing}</p>,
})
`)
    expect(modules.reference).toContain('./server-thing')
    expect(modules.reference).not.toContain('./client-thing')
    expect(modules['virtual component']).toContain('./client-thing')
    expect(modules['virtual component']).not.toContain('./server-thing')
    await expectValidModules(modules)
  })
})

describe('ported Turbopack tree-shaker fixtures: statements each part needs', () => {
  // Source: analyzer/route-kind (the compiled form of a TypeScript enum)
  it('gives the split component the statement that initializes the var it reads', async () => {
    const { modules } = compileRouteModules(`${head}var Kind: any
;(function (Kind: any) {
  Kind['A'] = 'a'
})(Kind || (Kind = {}))
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{Kind.A}</p>,
})
`)
    const component = modules['virtual component']!
    expect(component).toMatch(declarationOf('Kind'))
    expect(component).toContain(`Kind['A'] = 'a'`)
    expect(component).toContain('(Kind || (Kind = {}))')
    await expectValidModules(modules)
  })

  // Source: analyzer/nanoid, analyzer/let-bug-1 and analyzer/logger
  it('shares mutable state that the loader and the component update through shared helpers', async () => {
    const route = `${head}let pool: Array<number> | undefined, poolOffset = 0
let fillPool = (bytes: number) => {
  if (!pool || pool.length < bytes) {
    pool = new Array(bytes * 4).fill(0).map((_, i) => i)
    poolOffset = 0
  }
  poolOffset += bytes
}
let random = (bytes: number) => {
  fillPool(bytes)
  return pool!.slice(poolOffset - bytes, poolOffset)
}
let nanoid = (size = 2) => {
  fillPool(size)
  return pool!.slice(poolOffset - size, poolOffset).join('')
}
export const Route = createFileRoute('/')({
  loader: () => random(2),
  component: () => <p>{nanoid()}</p>,
})
`
    const { modules, sharedBindings } = compileRouteModules(route)
    expect(sharedBindings).toEqual(['fillPool', 'pool', 'poolOffset'])
    expect(modules.reference).toMatch(declarationOf('random'))
    expect(modules.reference).not.toMatch(declarationOf('nanoid'))
    expect(modules['virtual component']).toMatch(declarationOf('nanoid'))
    expect(modules['virtual component']).not.toMatch(declarationOf('random'))
    await expectValidModules(modules)
    // Both parts must observe one pool: the component continues where the
    // loader stopped.
    const result = await buildAndRun({
      files: { 'routes/index.tsx': route },
      script: `const loaded = await entry.Route.options.loader({})
return [loaded, await entry.render(entry.Route.options.component)]`,
    })
    expect(result).toEqual([[0, 1], '<p>23</p>'])
  }, 30_000)
})
