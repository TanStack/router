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
  compileAll,
  compileFor,
  compileHydrate,
  compileServer,
  createServerGraph,
  evaluateModule,
  evaluateHydrateParent,
  getBoundaryIds,
  getChunkComponent,
  getChunkIds,
  getChunkParams,
  hydrateParentStubs,
  importSources,
  loadClientModule,
  renderBoundaries,
  renderChunk,
} from './regression-helpers'

describe('server functions', () => {
  const provider = `import { createServerRpc } from '@tanstack/react-start/server-rpc'
const anyName = createServerRpc({ id: 'id-1', name: 'fn' }, (opts) => 'called:' + opts.data)
export { anyName as exportedAs }`
  const server = { ssr: 'export {}', provider }
  const report = (extractedFilename: string, functionName = 'exportedAs') => ({
    'id-1': {
      functionId: 'id-1',
      functionName,
      filename: '/test/src/module.tsx',
      extractedFilename,
    },
  })

  test('callProvider finds a handler by the server fn name in its metadata', async () => {
    expect(await callProvider(server, 'fn', {}, 'data')).toBe('called:data')
  })

  test('callProvider fails without exactly one handler of that name', async () => {
    await expect(callProvider(server, 'other')).rejects.toThrow(
      'provider handlers named other',
    )
  })

  test('callReportedServerFns calls the export the report names in the module it names', async () => {
    expect(
      await callReportedServerFns(
        server,
        report('/test/src/module.tsx?tss-serverfn-split'),
      ),
    ).toEqual(['called:undefined'])
    await expect(
      callReportedServerFns(server, report('/test/src/elsewhere.tsx')),
    ).rejects.toThrow('/test/src/elsewhere.tsx')
  })

  describe('the provider is linked to the SSR caller, like in the SSR bundle', () => {
    // A provider that imports the state it shares with the SSR caller
    // instead of declaring its own copy.
    const sharing = {
      ssr: `export let count = 0
export const bump = () => ++count`,
      provider: `import { createServerRpc } from '@tanstack/react-start/server-rpc'
import { bump } from './module'
export const handler = createServerRpc({ id: 'id-1', name: 'fn' }, () => bump())`,
    }

    test('a provider that imports the SSR caller shares its module instance', async () => {
      const graph = createServerGraph(sharing)
      const evaluated = await graph.provider()
      expect(await callProvider(evaluated, 'fn')).toBe(1)
      expect(await callProvider(evaluated, 'fn')).toBe(2)
      expect((await graph.ssr()).count).toBe(2)
    })

    test('callProvider and callReportedServerFns run a handler that imports the SSR caller', async () => {
      expect(await callProvider(sharing, 'fn')).toBe(1)
      expect(
        await callReportedServerFns(
          sharing,
          report('/test/src/module.tsx?tss-serverfn-split', 'handler'),
        ),
      ).toEqual([1])
    })

    test('the SSR caller is evaluated only when the provider imports it', async () => {
      const ssr = `export const bump = () => 0
throw new Error('SSR caller evaluated')`
      expect(await callProvider({ ssr, provider }, 'fn', {}, 'data')).toBe(
        'called:data',
      )
      await expect(callProvider({ ...sharing, ssr }, 'fn')).rejects.toThrow(
        'SSR caller evaluated',
      )
    })

    test('compileServer gives the SSR caller and the provider of a module', async () => {
      const head = `import { createServerFn } from '@tanstack/react-start'\n`
      const compiled = await compileServer(`${head}export let count = 0
export const bump = createServerFn().handler(async () => ++count)`)
      expect(Object.keys(compiled.serverFns)).toHaveLength(1)
      expect((await createServerGraph(compiled).ssr()).bump.rpc).toHaveProperty(
        'ssr',
      )
      expect(await callProvider(compiled, 'bump')).toBe(1)
    })
  })
})

describe('compileFor', () => {
  test('returns the source map of the compiled code, and none for an untouched module', async () => {
    const compiled = await compileFor(
      'client',
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'secret')`,
    )
    expect(compiled.map?.sources).toEqual(['/test/src/module.tsx'])
    expect(compiled.map?.mappings).not.toBe('')
    expect(await compileFor('client', 'export const a = 1')).toMatchObject({
      code: null,
      map: null,
    })
  })
})

describe('Start runtime stub', () => {
  test('server fn builders record their options, middleware and validator, and are callable', async () => {
    const module =
      await evaluateModule(`import { createMiddleware, createServerFn } from '@tanstack/react-start'
export const auth = createMiddleware({ type: 'function' })
export const createAuthServerFn = createServerFn({ method: 'POST' }).middleware([auth])
export const validate = (input) => input
export const fn = createAuthServerFn()
  .validator(validate)
  .handler(() => 'rpc', ({ data }) => 'handled:' + data)
export const caller = createAuthServerFn().handler('rpc-id')`)
    expect(module.fn.options).toEqual({
      method: 'POST',
      middleware: [module.auth],
      validator: module.validate,
    })
    expect(await module.fn({ data: 'x' })).toBe('handled:x')
    expect(await module.fn.__executeServer({ data: 'y' })).toBe('handled:y')
    // The recorded options are not part of the RPC a caller keeps.
    expect(module.caller).toEqual({ rpc: 'rpc-id' })
    expect(module.caller.options.middleware).toEqual([module.auth])
  })

  test('middleware records .client(), .validator() and .middleware(); .server() throws uncompiled', async () => {
    const module =
      await evaluateModule(`import { createMiddleware } from '@tanstack/react-start'
export const base = createMiddleware()
export const client = () => 'client'
export const validate = (input) => input
export const logger = createMiddleware({ type: 'function' })
  .middleware([base])
  .validator(validate)
  .client(client)`)
    expect(module.logger.options).toEqual({
      type: 'function',
      middleware: [module.base],
      validator: module.validate,
      client: module.client,
    })
    expect(() => module.logger.server(() => 'server')).toThrow(
      'uncompiled Start factory',
    )
  })
})

describe('framework option', () => {
  const solidServerFn = `import { createServerFn } from '@tanstack/solid-start'
export const fn = createServerFn().handler(async () => 'solid')`

  test('a Solid module compiles and evaluates against the Solid runtime', async () => {
    const compiled = await compileAll(solidServerFn, { framework: 'solid' })
    expect(Object.keys(compiled.serverFns)).toHaveLength(1)
    const client = await evaluateModule(
      compiled.client,
      {},
      { framework: 'solid' },
    )
    expect(client.fn.rpc).toHaveProperty('client')
    expect(await callProvider(compiled, 'fn')).toBe('solid')
    // The React runtime has no Solid package.
    await expect(evaluateModule(compiled.client)).rejects.toThrow(
      '@tanstack/solid-start',
    )
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

  test('loadClientModule: preload() loads the chunk of its own boundary, and loading the chunks is not a preload', async () => {
    const boundaries: Array<{ children: unknown; p?: () => Promise<unknown> }> =
      []
    const { module, chunkIds, preloaded } = await loadClientModule(
      `${head}import { idle } from '@tanstack/react-start/hydration'
export function Page() {
  return <><Hydrate><p>a</p></Hydrate><Hydrate prefetch={idle()}><p>b</p></Hydrate></>
}`,
      {
        stubs: {
          '@tanstack/react-start': {
            Hydrate: (props: {
              children: unknown
              p?: () => Promise<unknown>
            }) => {
              boundaries.push(props)
              return `[${props.children}]`
            },
          },
        },
      },
    )
    expect(module.Page()).toBe('[<p>a</p>][<p>b</p>]')
    expect(preloaded).toEqual([])
    const [a, b] = boundaries
    expect(a!.p).toBeUndefined()
    await b!.p!()
    expect(preloaded).toHaveLength(1)
    expect(chunkIds).toContain(preloaded[0]!.id)
    expect(getChunkComponent(preloaded[0]!.module)({})).toBe('<p>b</p>')
  })

  test('compileHydrate and loadClientModule split a Solid <Hydrate> with the framework option', async () => {
    const code = `import { Hydrate } from '@tanstack/solid-start'
export function Page() {
  return <Hydrate><p>solid</p></Hydrate>
}`
    expect((await compileHydrate('client', code)).chunks).toEqual([])
    expect(
      (await compileHydrate('client', code, { framework: 'solid' })).chunks,
    ).toHaveLength(1)
    const { module, lazyChunks } = await loadClientModule(code, {
      framework: 'solid',
    })
    expect(module.Page()).toBe('[<p>solid</p>]')
    expect(lazyChunks.map((chunk) => chunk.rendered)).toEqual([true])
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
