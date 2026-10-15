/**
 * Controls of the shared harness (`regression-helpers.ts`): each helper
 * checks behaviour through public contracts, not through the printed form of
 * the compiled code or generated names.
 */
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  callProvider,
  callReportedServerFns,
  compileHydrate,
  evaluateHydrateParent,
  evaluateModule,
  getBoundaryIds,
  getChunkIds,
  getChunkParams,
  hydrateParentStubs,
  importSources,
  loadClientModule,
  renderBoundaries,
  renderChunk,
} from './regression-helpers'

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

  test('every call evaluates a fresh instance', async () => {
    const code = `export const instance = {}`
    expect((await evaluateModule(code)).instance).not.toBe(
      (await evaluateModule(code)).instance,
    )
  })
})

describe('server functions', () => {
  const provider = `import { createServerRpc } from '@tanstack/react-start/server-rpc'
const anyName = createServerRpc({ id: 'id-1', name: 'fn' }, (opts) => 'called:' + opts.data)
export { anyName as exportedAs }`

  test('callProvider finds a handler by the server fn name in its metadata', async () => {
    expect(await callProvider(provider, 'fn', {}, 'data')).toBe('called:data')
  })

  test('callProvider fails without exactly one handler of that name', async () => {
    await expect(callProvider(provider, 'other')).rejects.toThrow(
      'provider handlers named other',
    )
  })

  test('callReportedServerFns calls the export the report names in the module it names', async () => {
    const report = (extractedFilename: string) => ({
      'id-1': {
        functionId: 'id-1',
        functionName: 'exportedAs',
        filename: '/test/src/module.tsx',
        extractedFilename,
      },
    })
    expect(
      await callReportedServerFns(
        provider,
        report('/test/src/module.tsx?tss-serverfn-split'),
      ),
    ).toEqual(['called:undefined'])
    await expect(
      callReportedServerFns(provider, report('/test/src/elsewhere.tsx')),
    ).rejects.toThrow('/test/src/elsewhere.tsx')
  })
})

test('importSources lists import and re-export declarations, not text', () => {
  expect(
    importSources(`const text = \`
import fake from './in-a-string'
\`
import type { T } from './types'
import { a } from './a'
export { b } from './b'
export * from './a'
import '@tanstack/react-start'
export const load = () => import('./lazy')`),
  ).toEqual(['./a', './a', './b', './types'])
})

describe('<Hydrate> helpers', () => {
  const head = `import { Hydrate } from '@tanstack/react-start'\n`

  test('getChunkIds lists the dynamic imports the Hydrate plugin serves', () => {
    expect(
      getChunkIds(`const text = 'import("/test/src/module.tsx?tss-hydrate=9_x")'
const other = () => import('./other')
const chunk = () => import('/test/src/module.tsx?tss-hydrate=0_x')`),
    ).toEqual(['/test/src/module.tsx?tss-hydrate=0_x'])
  })

  test('getBoundaryIds reads the h prop of the Hydrate elements only', () => {
    expect(
      getBoundaryIds(`import { Hydrate as Boundary } from '@tanstack/react-start'
export const Page = () => <><Boundary h="a" /><div data-h="b" /><Boundary h={'c'} /></>`),
    ).toEqual(['a', 'c'])
  })

  test('compileHydrate orders chunks like their boundaries in the source', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${head}export function Page() {
  return <div><Hydrate><p>first</p></Hydrate><Hydrate><p>second</p></Hydrate><Hydrate><section><Hydrate><p>nested</p></Hydrate></section></Hydrate></div>
}
export function Other() {
  return <Hydrate><p>fourth</p></Hydrate>
}`,
    )
    const rendered = []
    for (const chunk of chunks) {
      rendered.push(await renderChunk(chunk, {}, hydrateParentStubs))
    }
    expect(rendered).toEqual([
      '<p>first</p>',
      '<p>second</p>',
      '<section>[<p>nested</p>]</section>',
      '<p>fourth</p>',
    ])
  })

  test.each([
    `export function Anything(props) { return props.b + props.a }`,
    `export const Anything = ({ a, b }) => a + b`,
  ])(
    'getChunkParams lists the props the chunk component reads: %s',
    async (chunk) => {
      expect(await getChunkParams(chunk)).toEqual(['a', 'b'])
      expect(await renderChunk(chunk, { a: 'A', b: 'B' })).toMatch(/^(AB|BA)$/)
    },
  )

  test('evaluateHydrateParent links a chunk to the evaluated parent', async () => {
    const linked = await evaluateHydrateParent(
      createHydrateCompilerPlugin(),
      `export let count = 0
export function bump() { count++ }`,
    )
    linked.module.bump()
    expect(
      await linked.renderChunk(`import { count } from './module.tsx'
export function Chunk() { return count }`),
    ).toBe(1)
  })

  test('loadClientModule loads the chunks of nested boundaries', async () => {
    const { module, lazyChunks } =
      await loadClientModule(`${head}export function Page() {
  return <Hydrate><section><Hydrate><p>inner</p></Hydrate></section></Hydrate>
}`)
    expect(module.Page()).toBe('[<section>[<p>inner</p>]</section>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true, true])
  })

  test('renderBoundaries records the boundary ids the server and the client render', async () => {
    const code = `${head}export function Page({ flag }) {
  return <div>{flag ? <Hydrate><p>yes</p></Hydrate> : <Hydrate><p>no</p></Hydrate>}<Hydrate><p>last</p></Hydrate></div>
}`
    const rendered = async (flag: boolean) => {
      const render = (module: Record<string, any>) => module.Page({ flag })
      return {
        server: await renderBoundaries('server', code, render),
        client: await renderBoundaries('client', code, render),
      }
    }
    const yes = await rendered(true)
    const no = await rendered(false)
    expect(yes.client).toEqual(yes.server)
    expect(no.client).toEqual(no.server)
    expect(yes.server.html).toBe('<div>[<p>yes</p>][<p>last</p>]</div>')
    expect(yes.server.ids).toHaveLength(2)
    expect(no.server.ids[0]).not.toBe(yes.server.ids[0])
    expect(no.server.ids[1]).toBe(yes.server.ids[1])
  })
})
