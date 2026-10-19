/**
 * Controls of the shared harness (`regression-helpers.ts`): each helper
 * checks behaviour through public contracts, not through the printed form of
 * the compiled code or generated names.
 */
import { describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import {
  callProvider,
  callReportedServerFns,
  callServerFnThroughCallers,
  callerRpcId,
  compileAll,
  compileErrorMessage,
  compileFor,
  compileHydrate,
  compileServer,
  createServerGraph,
  evaluateModule,
  expectClientRendersLikeServer,
  expectCompileError,
  getChunkIds,
  importSources,
  loadChunk,
  moduleLoads,
  renderClient,
  renderServer,
} from './regression-helpers'

describe('server functions', () => {
  // A provider handler answers the server-fn router `{ result }`.
  const provider = `import { createServerRpc } from '@tanstack/react-start/server-rpc'
const anyName = createServerRpc({ id: 'id-1', name: 'fn' }, (opts) => ({ result: 'called:' + opts.data }))
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
export const handler = createServerRpc({ id: 'id-1', name: 'fn' }, () => ({ result: bump() }))`,
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
      expect(await (await createServerGraph(compiled).ssr()).bump()).toBe(1)
      expect(await callProvider(compiled, 'bump')).toBe(1)
    })
  })

  describe('in the SSR bundle, a server fn the SSR caller calls', () => {
    const ssrById = `import { createServerFn } from '@tanstack/react-start'
import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
export const fn = createServerFn().handler(createSsrRpc('id-1'))`

    test('by id runs the handler the report names', async () => {
      const ssr = await createServerGraph({
        ssr: ssrById,
        provider,
        serverFns: report('/test/src/module.tsx?tss-serverfn-split'),
      }).ssr()
      expect(await ssr.fn({ data: 'data' })).toBe('called:data')
    })

    test('by an id nobody reported fails', async () => {
      const ssr = await createServerGraph({ ssr: ssrById, provider }).ssr()
      await expect(ssr.fn()).rejects.toThrow('id-1')
    })

    // In place: `.handler(extractedFn, serverFn)`, like the provider.
    test('in place runs it after its middleware and validator', async () => {
      const ssr = await createServerGraph({
        ssr: `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { createServerRpc } from '@tanstack/react-start/server-rpc'
export const seen = []
const auth = createMiddleware({ type: 'function' })
  .validator((data) => (seen.push('middleware validator'), data + '?'))
  .client(async ({ next }) => {
    seen.push('client')
    return next({ sendContext: { from: 'client' } })
  })
  .server(async ({ next, context }) => {
    seen.push('server:' + context.from)
    return next({ context: { user: 'user' } })
  })
const fn_handler = createServerRpc({ id: 'in-place', name: 'fn' }, (opts) =>
  fn.__executeServer(opts),
)
export const fn = createServerFn({ method: 'POST' })
  .middleware([auth])
  .validator({ parse: (data) => (seen.push('validator'), data + '!') })
  .handler(fn_handler, async function ({ data, context, method, serverFnMeta }) {
    seen.push('handler')
    return [data, context.user, method, serverFnMeta.name, this.method]
  })`,
        provider,
      }).ssr()
      expect(await ssr.fn({ data: 'data' })).toEqual([
        'data?!',
        'user',
        'POST',
        'fn',
        'POST',
      ])
      expect(ssr.seen).toEqual([
        'client',
        'middleware validator',
        'server:client',
        'validator',
        'handler',
      ])
    })

    // Start's runtime takes the one argument of an uncompiled `.handler()`
    // for the RPC: the call does not answer what the handler returns.
    test('left uncompiled (given its handler alone) does not return its result', async () => {
      const ssr = await createServerGraph({
        ssr: `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'handler')`,
        provider,
      }).ssr()
      expect(await ssr.fn()).not.toBe('handler')
    })
  })
})

describe('compile error oracles', () => {
  const source = `import { createServerFn } from '@tanstack/react-start'
const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`
  /** A compile error with a code frame quoting line 3 of `source`. */
  const framed = (message: string) =>
    new Error(`${message}
  1 | import { createServerFn } from '@tanstack/react-start'
  2 | const args: Array<() => unknown> = []
> 3 | export const fn = createServerFn().handler(...args)
    |                   ^^^^^^^^^^^^^^`)

  // Synthetic errors (SPEC §8): the control is about the helpers, not about
  // what the compiler says today.
  test('compileErrorMessage drops the code frame that quotes the source', () => {
    const message = compileErrorMessage(framed('MARK_SENTENCE'))
    expect(message).toBe('MARK_SENTENCE')
  })

  test('expectCompileError accepts an error naming the API at its line', () => {
    expectCompileError(framed('createServerFn cannot be used here'), {
      source,
      at: 'createServerFn()',
      names: ['createServerFn'],
    })
  })

  test('expectCompileError rejects an error that names the API only in the quoted source', () => {
    expect(() =>
      expectCompileError(framed('the arguments cannot be spread'), {
        source,
        at: 'createServerFn()',
        names: ['createServerFn'],
      }),
    ).toThrow('createServerFn')
  })

  test('expectCompileError rejects an error pointing at another line', () => {
    expect(() =>
      expectCompileError(framed('createServerFn cannot be used here'), {
        source,
        at: 2,
        names: ['createServerFn'],
      }),
    ).toThrow('line 2')
  })

  test('expectCompileError rejects an error without a position', () => {
    expect(() =>
      expectCompileError(new Error('createServerFn cannot be used here'), {
        source,
        at: 'createServerFn()',
        names: ['createServerFn'],
      }),
    ).toThrow('line 3')
  })

  test('expectCompileError reads a real compile error of the Start compiler', async () => {
    const error = await compileFor('client', source).catch(
      (caught: unknown) => caught,
    )
    expectCompileError(error, { source, at: '...args', names: ['handler'] })
  })
})

/** A compiled module and the server fns its compilation reported. */
const callableServerFn = async (code: string) => {
  const compiled = await compileAll(code)
  return { compiled, read: (module: Record<string, any>) => module.fn }
}

describe('callServerFnThroughCallers', () => {
  test('calls a top-level server fn through the RPC the callers give', async () => {
    const { compiled, read } = await callableServerFn(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`,
    )
    expect(await callServerFnThroughCallers(compiled, read)).toBe('called')
  })

  test('fails when a caller keeps the handler instead of an RPC', async () => {
    const { compiled, read } = await callableServerFn(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`,
    )
    await expect(
      callServerFnThroughCallers(
        {
          ...compiled,
          client: `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`,
        },
        read,
      ),
    ).rejects.toThrow('client')
  })

  /** An SSR caller that runs the handler in place, like the provider. */
  const inPlace = (
    result: string,
  ) => `import { createServerFn } from '@tanstack/react-start'
import { createServerRpc } from '@tanstack/react-start/server-rpc'
const fn_handler = createServerRpc({ id: 'in-place', name: 'fn' }, (opts) => fn.__executeServer(opts))
export const fn = createServerFn().handler(fn_handler, async () => '${result}')`

  test('accepts an SSR caller that runs the handler in place', async () => {
    const { compiled, read } = await callableServerFn(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`,
    )
    expect(
      await callServerFnThroughCallers(
        { ...compiled, ssr: inPlace('called') },
        read,
      ),
    ).toBe('called')
  })

  test('fails when the SSR caller does not run the handler', async () => {
    const { compiled, read } = await callableServerFn(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`,
    )
    await expect(
      callServerFnThroughCallers({ ...compiled, ssr: inPlace('other') }, read),
    ).rejects.toThrow('ssr')
  })

  test('fails when the SSR caller is left uncompiled', async () => {
    const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'called')`
    const { compiled, read } = await callableServerFn(code)
    await expect(
      callServerFnThroughCallers({ ...compiled, ssr: code }, read),
    ).rejects.toThrow('ssr')
  })
})

describe('compileFor', () => {
  // Internal control of the helper: it hands on the compiler's map (map
  // layout is free, SPEC G6), and `null` for a module the compiler leaves
  // untouched (the hosts' convention, not a compiler requirement).
  test('returns the source map of the compiled code, and none for an untouched module', async () => {
    const compiled = await compileFor(
      'client',
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'secret')`,
    )
    const [offset] = tokenOffsets(compiled.code!, { identifier: 'fn' })
    expectMapsTo(compiled.map as never, positionAt(compiled.code!, offset!), {
      file: '/test/src/module.tsx',
      line: 2,
    })
    expect(await compileFor('client', 'export const a = 1')).toMatchObject({
      code: null,
      map: null,
    })
  })
})

// Evaluated modules run Start's real runtime (`./start-runtime`); only the
// RPC factories the harness cannot run in-process are replaced.
describe('Start runtime', () => {
  test('the server runtime rejects client RPCs', async () => {
    await expect(
      evaluateModule(
        `import { createClientRpc } from '@tanstack/react-start/client-rpc'
export const rpc = createClientRpc('id-1')`,
        {},
        { env: 'server' },
      ),
    ).rejects.toThrow('createClientRpc(id-1) in the server runtime')
  })

  // The id of Start's server-fn metadata, whatever other fields it carries
  // (SPEC §5.19); an uncompiled server fn has none.
  test('callerRpcId reads the id of a caller, and none of an uncompiled server fn', async () => {
    const module =
      await evaluateModule(`import { createServerFn } from '@tanstack/react-start'
import { createClientRpc } from '@tanstack/react-start/client-rpc'
export const caller = createServerFn().handler(createClientRpc('id-1'))
export const inPlace = createServerFn().handler(async () => 'handler')`)
    expect(callerRpcId(module.caller)).toBe('id-1')
    expect(callerRpcId(module.inPlace)).toBeUndefined()
  })

  // Start's createServerFn.ts: `__executeServer` runs the validator and .server() of
  // each middleware, whose next() passes the context on, then the server
  // fn's validator and `options.serverFn(ctx)`; it answers { result } (with
  // the context server middleware sends back) or { error }.
  test('a handler runs after its middleware and validators, with its ctx and this', async () => {
    const module = await evaluateModule(
      `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { createServerRpc } from '@tanstack/react-start/server-rpc'
export const seen = []
const outer = createMiddleware({ type: 'function' })
  .validator((data) => (seen.push('outer validator'), { ...data, outer: true }))
  .server(async ({ next, data }) => {
    seen.push('outer:' + data.outer)
    const result = await next({ context: { user: 'u' }, sendContext: { sent: 1 } })
    seen.push('outer done')
    return result
  })
const inner = createMiddleware({ type: 'function' })
  .middleware([outer])
  .server(({ next, context }) => {
    seen.push('inner:' + context.user + ':' + context.fromClient)
    return next({ context: { role: 'admin' } })
  })
const fn_handler = createServerRpc({ id: 'id-1', name: 'fn', filename: 'f.ts' }, (opts) => fn.__executeServer(opts))
export const fn = createServerFn({ method: 'POST' })
  .middleware([inner])
  .validator({ parse: (data) => ({ ...data, parsed: true }) })
  .handler(fn_handler, async function (ctx) {
    seen.push('handler')
    return { ctx: Object.keys(ctx).sort(), data: ctx.data, context: ctx.context, method: ctx.method, meta: ctx.serverFnMeta, isOptions: this.serverFn !== undefined && this.method === 'POST' }
  })
const failing_handler = createServerRpc({ id: 'id-2', name: 'failing' }, (opts) => failing.__executeServer(opts))
export const failing = createServerFn().handler(failing_handler, () => {
  throw new Error('handler failed')
})
export { fn_handler, failing_handler }`,
      {},
      { env: 'server' },
    )
    const response = await module.fn_handler({
      data: { n: 1 },
      context: { fromClient: 'c' },
    })
    expect(response).toEqual({
      result: {
        ctx: expect.arrayContaining([
          'context',
          'data',
          'method',
          'serverFnMeta',
        ]),
        data: { n: 1, outer: true, parsed: true },
        context: { fromClient: 'c', user: 'u', role: 'admin' },
        method: 'POST',
        meta: { id: 'id-1', name: 'fn', filename: 'f.ts' },
        isOptions: true,
      },
      context: { sent: 1 },
    })
    expect(module.seen).toEqual([
      'outer validator',
      'outer:true',
      'inner:u:c',
      'handler',
      'outer done',
    ])
    const failed = await module.failing_handler({})
    expect(failed.error).toEqual(new Error('handler failed'))
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
    expect(callerRpcId(client.fn)).toEqual(expect.any(String))
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

// The S06 load oracle: what evaluating a compiled module loads, observed
// through the module linker, not an inventory of its import declarations.
describe('moduleLoads', () => {
  test('lists the static imports of the module and of the modules it links, and the targets of its dynamic imports', async () => {
    const loads = await moduleLoads(
      `import { a } from './a'
import './side-effect'
export { b } from './b'
export const load = () => import('./lazy')
export const value = a`,
      { files: { '/test/src/a.ts': `export { a } from './deep'` } },
    )
    expect(loads).toEqual(
      expect.arrayContaining([
        '/test/src/a.ts',
        './deep',
        './side-effect',
        './b',
        './lazy',
      ]),
    )
  })

  test('does not list modules a type-only import or a string names', async () => {
    const loads = await moduleLoads(`import type { T } from './types'
const text = "import x from './in-a-string'"
export const value: T | string = text`)
    expect(loads).not.toContain('./types')
    expect(loads).not.toContain('./in-a-string')
  })

  // With verbatimModuleSyntax, `import { type X }` keeps the module as a
  // side-effect import (ruling L3: the compiler should drop it).
  test('lists a module imported with type specifiers only', async () => {
    expect(
      await moduleLoads(`import { type T } from './types'
export const value: T | undefined = undefined`),
    ).toContain('./types')
  })

  test('lists a forbidden module whose top-level code throws', async () => {
    expect(
      await moduleLoads(`import { db } from './db.server'
export const value = db.x()`),
    ).toContain('./db.server')
  })
})

describe('<Hydrate> helpers', () => {
  const head = `import { Hydrate } from '@tanstack/react-start'
import { idle } from '@tanstack/react-start/hydration'
`

  test('getChunkIds lists the dynamic imports the Hydrate plugin serves', () => {
    expect(
      getChunkIds(`const text = 'import("/test/src/module.tsx?tss-hydrate=9_x")'
const other = () => import('./other')
const chunk = () => import('/test/src/module.tsx?tss-hydrate=0_x')`),
    ).toEqual(['/test/src/module.tsx?tss-hydrate=0_x'])
  })

  test('renderClient renders nested boundaries through code it loads while rendering', async () => {
    const code = `${head}export function Page() {
  return <Hydrate when={idle()}><section><Hydrate when={idle()}><p>inner</p></Hydrate></section></Hydrate>
}`
    const { server, client } = await expectClientRendersLikeServer(code)
    expect(server.html).toContain('<section>')
    expect(server.html).toContain('<p>inner</p>')
    // Nothing the children render loaded with the parent module.
    expect(client.requestedAtLoad.filter((id) => client.graph.has(id))).toEqual(
      [],
    )
    expect(client.lazy).not.toEqual([])
  })

  // The comparison sees a client that renders other children than the
  // server: its chunks are loaded from an edited source (as a chunk loaded
  // for the wrong boundary or from stale code would render).
  test('expectClientRendersLikeServer fails when the client renders other children', async () => {
    const code = `${head}export function Page() {
  return <div><Hydrate when={idle()}><p>first</p></Hydrate><Hydrate when={idle()}><p>second</p></Hydrate></div>
}`
    const server = await renderServer(code)
    const compiled = await compileHydrate('client', code)
    const edited = code.replace('second', 'other')
    const client = await renderClient(code, {
      compiled,
      loadChunk: (id) => loadChunk(compiled.plugin, 'client', id, edited),
    })
    expect(client.html).toContain('<p>other</p>')
    expect(client.html).not.toBe(server.html)
    await expect(
      expectClientRendersLikeServer(code, {
        compiled,
        loadChunk: (id) => loadChunk(compiled.plugin, 'client', id, edited),
      }),
    ).rejects.toThrow()
  })

  test('a render error fails the render', async () => {
    await expect(
      renderServer(`${head}export function Page() {
  return <Hydrate when={idle()}><p>{(() => { throw new Error('render-error-marker') })()}</p></Hydrate>
}`),
    ).rejects.toThrow('render-error-marker')
  })

  // Boundaries in mutually exclusive branches at the same position may get
  // the same identity (SPEC J5.4); what is required is server/client
  // agreement in each render and distinct identities among the boundaries
  // rendered together. Switching branches in a hydrated page:
  // integration/hydrate-pages.test.ts.
  // Source: S37 (V1 start)
  test.each([true, false])(
    'the client renders the hydration ids the server renders, flag %s',
    async (flag) => {
      const code = `${head}export function Page({ flag }) {
  return <div>{flag ? <Hydrate when={idle()}><p>yes</p></Hydrate> : <Hydrate when={idle()}><p>no</p></Hydrate>}<Hydrate when={idle()}><p>last</p></Hydrate></div>
}`
      const { server } = await expectClientRendersLikeServer(code, {
        props: { flag },
      })
      expect(server.html).toContain(flag ? '<p>yes</p>' : '<p>no</p>')
      const ids = [
        ...server.html.matchAll(/data-ts-hydrate-id="([^"]*)"/g),
      ].map((match) => match[1])
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
    },
  )
})
