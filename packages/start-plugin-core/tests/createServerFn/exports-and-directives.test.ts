import { parseSync } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import {
  callProvider,
  callReportedServerFns,
  callServerFnThroughCallers,
  compileAll,
  compileCode,
  compileFor,
  compileServer,
  createServerGraph,
  directivePrologue,
  evaluateModule,
  evaluateProvider,
  importSources,
} from '../regression-helpers'

// Callers keep the module's exports: the client gets each server fn as an
// RPC, and calling one from the SSR caller runs its handler; the provider
// module exports the handlers the server-fn resolver runs by id. Module
// directives, ids and module formats must survive these rewrites.

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * The handlers an evaluated provider exports, by the server fn name in their
 * metadata (`meta.name`).
 */
function handlersByName(provider: Record<string, any>) {
  const handlers: Record<string, { meta: { id: string; name: string } }> = {}
  for (const value of Object.values(provider)) {
    if (typeof value === 'function' && value.meta?.name !== undefined) {
      handlers[value.meta.name] = value
    }
  }
  return handlers
}

describe('export forms', () => {
  // Source: Next.js server-actions fixtures server-graph/9, /12, /13, /29,
  // /66, /69, client-graph/4, /15
  test('callers keep every export form, each server fn running its own handler', async () => {
    const compiled =
      await compileAll(`${head}const a = createServerFn().handler(async () => 'a')
const b = createServerFn().handler(async () => 'b')
const c = createServerFn().handler(async () => 'c')
export const d = createServerFn().handler(async () => 'd'),
  notAServerFn = 1
export let e = createServerFn().handler(async () => 'e')
export var f = createServerFn().handler(async () => 'f')
export { a as default, b as '📙', c as as }`)
    const provider = await evaluateProvider(compiled)
    const handlers = handlersByName(provider)
    const exported = {
      default: 'a',
      '📙': 'b',
      as: 'c',
      d: 'd',
      e: 'e',
      f: 'f',
    }
    const client = await evaluateModule(compiled.client)
    expect({ ...client }).toEqual({
      notAServerFn: 1,
      ...Object.fromEntries(
        Object.entries(exported).map(([name, local]) => [
          name,
          { rpc: { client: handlers[local]!.meta.id } },
        ]),
      ),
    })
    const ssr = await createServerGraph(compiled).ssr()
    expect(ssr.notAServerFn).toBe(1)
    for (const [name, local] of Object.entries(exported)) {
      expect(await ssr[name](), name).toBe(local)
    }
    // Each reported server fn runs its own handler.
    expect(Object.keys(compiled.serverFns)).toHaveLength(6)
    expect(
      await callReportedServerFns(compiled, compiled.serverFns).then(
        (results) => results.sort(),
      ),
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  // Source: Next.js server-actions fixtures client-graph/1, server-graph/10, /11, /15
  test.each([
    `export default async function () {\n  return fn()\n}`,
    `export default class {\n  call() {\n    return fn()\n  }\n}`,
  ])('an anonymous default export next to a server fn: %s', async (code) => {
    const compiled = await compileAll(
      `${head}export const fn = createServerFn().handler(async () => 1)\n${code}`,
    )
    expect((await evaluateModule(compiled.client)).default).toBeTypeOf(
      'function',
    )
    expect(await callProvider(compiled, 'fn')).toBe(1)
  })

  // E.g. a Vue options-API component or a config object.
  test.each([
    { code: 'export default { a: 1, b: 2 }', value: { a: 1, b: 2 } },
    { code: 'export default 42', value: 42 },
  ])(
    'a default-exported expression next to a server fn: $code',
    async ({ code, value }) => {
      const compiled = await compileAll(
        `${head}export const fn = createServerFn().handler(async () => 1)\n${code}`,
      )
      expect((await evaluateModule(compiled.client)).default).toEqual(value)
      expect(await callProvider(compiled, 'fn')).toBe(1)
    },
  )

  // Source: @vitejs/plugin-rsc source-map/wrap-export/local-export-before-declaration.js
  test('an export list before the server fn declaration', async () => {
    const compiled = await compileAll(`${head}export { fn, fn as alias }
const fn = createServerFn().handler(async () => 'fn')`)
    const client = await evaluateModule(compiled.client)
    expect(client.alias).toBe(client.fn)
    expect(client.fn.rpc).toHaveProperty('client')
    expect(await callProvider(compiled, 'fn')).toBe('fn')
  })

  // Source: @vitejs/plugin-rsc source-map/wrap-export/dependent-declarators.js
  test('a server fn built from a sibling declarator', async () => {
    const compiled = await compileAll(`${head}import { db } from './db.server'
export const base = createServerFn(), fn = base.handler(async () => db.x())`)
    expect(importSources(compiled.client)).toEqual([])
    expect(
      await callProvider(compiled, 'fn', {
        './db.server': `export const db = { x: () => 'x' }`,
      }),
    ).toBe('x')
  })

  // Source: @vitejs/plugin-rsc wrap-export.test.ts "re-export simple",
  // "re-export rename", "re-export all simple", "re-export all rename"
  test('re-exports stay in the callers', async () => {
    const compiled = await compileAll(`${head}export { x } from './dep'
export { x as y } from './dep'
export * from './star'
export * as ns from './dep'
export const fn = createServerFn().handler(async () => 'fn')`)
    const stubs = {
      './dep': `export const x = 'x'`,
      './star': `export const starred = 'starred'`,
    }
    for (const caller of [compiled.client, compiled.ssr]) {
      const module = await evaluateModule(caller, stubs)
      expect(Object.keys(module).sort()).toEqual([
        'fn',
        'ns',
        'starred',
        'x',
        'y',
      ])
      expect([module.x, module.y, module.starred, module.ns.x]).toEqual([
        'x',
        'x',
        'starred',
        'x',
      ])
    }
    expect(await callProvider(compiled, 'fn', stubs)).toBe('fn')
  })

  // JSON modules only load with their `type: 'json'` attribute.
  // Source: @vitejs/plugin-rsc source-map/wrap-export/reexport-attributes.js;
  // Turbopack tree-shaker analyzer/import-with-clause
  test('import attributes are kept on the imports and re-exports each output keeps', async () => {
    const compiled =
      await compileAll(`${head}import config from './config.json' with { type: 'json' }
import secrets from './secrets.json' with { type: 'json' }
export { default as data } from './data.json' with { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => secrets.key)`)
    const stubs = {
      './config.json': `{ "theme": "dark" }`,
      './data.json': `{ "data": true }`,
      './secrets.json': `{ "key": "s3cret" }`,
    }
    expect(importSources(compiled.client)).toEqual([
      './config.json',
      './data.json',
    ])
    const client = await evaluateModule(compiled.client, stubs)
    expect([client.theme, client.data]).toEqual(['dark', { data: true }])
    const ssr = await createServerGraph(compiled, stubs).ssr()
    expect([ssr.theme, ssr.data]).toEqual(['dark', { data: true }])
    expect(
      await callServerFnThroughCallers(compiled, (module) => module.fn, stubs),
    ).toBe('s3cret')
  })

  // Source: Next.js server-actions fixtures server-graph/60, /62, /68, /72
  test('TypeScript-only exports and an enum next to a server fn', async () => {
    const compiled =
      await compileAll(`${head}import type { Stuff } from './stuff'
export type X = string
export { type A } from './a'
export type { B } from './b'
export type * from './c'
export type { Foo }
type Foo = string
export interface I {}
export enum E {
  A = 'a',
}
export declare const declared: number
export default interface D {}
export const fn = createServerFn().handler(async (): Promise<Stuff | string> => E.A)`)
    expect(await callProvider(compiled, 'fn')).toBe('a')
  })

  // Source: TanStack/router#6480 (an exported type that reads a schema built
  // from an imported enum kept the enum's server module in the client);
  // replaces router-utils stripTypeExports "handles the issue #6480
  // scenario", which never checked the symptom.
  test('an exported type reading a schema the handler uses keeps its imports out of the client', async () => {
    const stubs = {
      './PostService': `export const PostCategory = { News: 'news' }`,
      zod: `export const z = {
  object: (shape) => ({ parse: (value) => ({ category: shape.category.parse(value.category) }) }),
  nativeEnum: (values) => ({ parse: (value) => Object.values(values).includes(value) ? value : 'invalid' }),
}`,
    }
    const compiled = await compileAll(`${head}import { z } from 'zod'
import { PostCategory } from './PostService'
const postSchema = z.object({ category: z.nativeEnum(PostCategory) })
export type CreatePostInput = z.infer<typeof postSchema>
export const createPost = createServerFn().handler(async () =>
  postSchema.parse({ category: 'news' }),
)`)
    expect(importSources(compiled.client)).not.toContain('./PostService')
    expect(await callProvider(compiled, 'createPost', stubs)).toEqual({
      category: 'news',
    })
  })

  // The provider may repeat the module's top-level code or import the SSR
  // caller for it; it runs once is the goal pinned in
  // known-bugs-start-compiler.test.ts ("SSR: a server fn module is
  // initialised once ...").
  // Source: Next.js server-actions fixtures client-graph/2
  test('side-effect imports and top-level statements stay in the callers, and the handler runs next to them', async () => {
    const compiled = await compileAll(`${head}import './polyfill'
console.log('side-effect-marker')
export const fn = createServerFn().handler(async () => 'fn')`)
    const ran: Array<string> = []
    vi.spyOn(console, 'log').mockImplementation((marker: string) => {
      ran.push(marker)
    })
    const stubs = {
      './polyfill': `console.log('polyfill')\nexport {}`,
    }
    try {
      for (const output of ['client', 'ssr'] as const) {
        expect(importSources(compiled[output]), output).toEqual(['./polyfill'])
        ran.length = 0
        await evaluateModule(compiled[output], stubs)
        expect(ran, output).toEqual(['polyfill', 'side-effect-marker'])
      }
      ran.length = 0
      expect(await callProvider(compiled, 'fn', stubs)).toBe('fn')
      expect(ran).toContain('polyfill')
    } finally {
      vi.restoreAllMocks()
    }
  })

  const redeclared = `${head}var fn = createServerFn().handler(async () => 1)
var fn = createServerFn().handler(async () => 2)
export { fn }`

  test('redeclared var server fns get distinct ids', async () => {
    const compiled = await compileAll(redeclared)
    expect(new Set(Object.keys(compiled.serverFns)).size).toBe(2)
  })

  // Which handler each one runs is pinned below; here every reported server
  // fn has a handler in the provider.
  test.each(['fn', '_fn', '$fn', 'ñandú'])(
    'three redeclared var server fns named %s get distinct ids the provider serves',
    async (name) => {
      const compiled =
        await compileAll(`${head}var ${name} = createServerFn().handler(async () => 1)
var ${name} = createServerFn().handler(async () => 2)
var ${name} = createServerFn().handler(async () => 3)
export { ${name} }`)
      expect(new Set(Object.keys(compiled.serverFns)).size).toBe(3)
      expect(
        await callReportedServerFns(compiled, compiled.serverFns),
      ).toHaveLength(3)
    },
  )

  // Bug: the provider runs each server fn through its variable
  // (`fn.__executeServer`), so with a redeclared `var` every handler export
  // runs the last declaration's handler.
  // Impact: calling the first server fn (an RPC read before the
  // redeclaration) runs the second one's handler on the server.
  // Source: exports-and-directives.test.ts "redeclared var server fns get
  // distinct versioned handler names", rewritten to call the handlers.
  test.fails(
    'redeclared var server fns each run their own handler',
    async () => {
      const compiled = await compileAll(redeclared)
      const ids = Object.keys(compiled.serverFns)
      const results = await callReportedServerFns(compiled, compiled.serverFns)
      expect([...results].sort()).toEqual([1, 2])
      // The exported binding is the last declaration's server fn.
      expect((await evaluateModule(compiled.client)).fn).toEqual({
        rpc: { client: ids[results.indexOf(2)] },
      })
    },
  )
})

/** The directive prologue of each function of a module, in source order. */
function functionDirectives(code: string) {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const prologues: Array<Array<string>> = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node !== 'object' || node === null) {
      return
    }
    const { type, body } = node as { type?: string; body?: any }
    if (
      (type === 'FunctionExpression' ||
        type === 'FunctionDeclaration' ||
        type === 'ArrowFunctionExpression') &&
      body?.type === 'BlockStatement'
    ) {
      const directives: Array<string> = []
      for (const statement of body.body) {
        if (typeof statement.directive !== 'string') {
          break
        }
        directives.push(statement.directive)
      }
      prologues.push(directives)
    }
    Object.values(node).forEach(visit)
  }
  visit(program)
  return prologues
}

describe('directives', () => {
  // Source: Next.js server-actions fixtures server-graph/8
  test('handler directives stay in the provider', async () => {
    const compiled =
      await compileAll(`${head}export const fn = createServerFn().handler(async function () {
  'use strict'
  'use server'
  return 1
})`)
    expect(functionDirectives(compiled.provider)).toContainEqual([
      'use strict',
      'use server',
    ])
    expect(await callProvider(compiled, 'fn')).toBe(1)
  })

  // Source: Next.js server-actions fixtures server-graph/3, /4;
  // @vitejs/plugin-rsc utils.test.ts "recognizes directive prologues"
  test.each([
    { prologue: `'use client'\n`, directives: ['use client'] },
    { prologue: `// app/send.ts\n'use server'\n`, directives: ['use server'] },
    {
      prologue: `'use strict'\n'use client'\n`,
      directives: ['use strict', 'use client'],
    },
  ])(
    'module directives stay first in the callers: $directives',
    async ({ prologue, directives }) => {
      const code = `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`
      const prologuePattern = new RegExp(
        String.raw`^(?:\s*//[^\n]*\n)*` +
          directives
            .map((directive) => String.raw`\s*['"]${directive}['"];?`)
            .join(''),
      )
      for (const output of ['client', 'ssr'] as const) {
        expect(await compileCode(output, code)).toMatch(prologuePattern)
      }
    },
  )

  // `serverFnProviderModuleDirectives` are in the provider's prologue, next
  // to the directives the module already has.
  // Source: @vitejs/plugin-rsc utils.test.ts "recognizes directive prologues"
  test.each([
    { prologue: `'use server'\n`, directives: ['use server'] },
    {
      prologue: `'use strict'\n'use server'\n`,
      directives: ['use strict', 'use server'],
    },
  ])(
    'a provider whose prologue already has the configured directive keeps it: $directives',
    async ({ prologue, directives }) => {
      const server = await compileServer(
        `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`,
        { directives: ['use server', '', 'use server'] },
      )
      expect(directivePrologue(server.provider)).toEqual(
        expect.arrayContaining(directives),
      )
      expect(await callProvider(server, 'fn')).toBe(1)
    },
  )

  test.each([`import './setup'\n'use server'\n`, `('use server')\n`])(
    'a "use server" string outside the prologue is not the configured directive: %j',
    async (prologue) => {
      const provider = await compileCode(
        'provider',
        `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`,
        { directives: ['use server'] },
      )
      expect(directivePrologue(provider!)).toContain('use server')
    },
  )
})

describe('server function ids', () => {
  test('dev providers export the handler', async () => {
    const server = await compileServer(
      `${head}export const getPosts = createServerFn().handler(async () => 'posts')`,
      { mode: 'dev' },
    )
    expect(await callProvider(server, 'getPosts')).toBe('posts')
  })

  // Dev-only code never reaches production (R7). Source: gap SF18 / DV33 (N12)
  test('build providers have no dev HMR code', async () => {
    const provider = await compileCode(
      'provider',
      `${head}export const getPosts = createServerFn().handler(async () => 'posts')`,
      { mode: 'build' },
    )
    expect(provider).not.toMatch(/import\.meta\.(webpack)?[Hh]ot/)
  })

  /** The ids of the server fns in `code`. */
  async function idsOf(
    code: string,
    options: Parameters<typeof compileFor>[2] = {},
  ) {
    return Object.keys(
      (await compileFor('client', `${head}${code}`, options)).serverFns,
    )
  }

  // Source: SolidStart compile.spec.ts "keeps ids of existing functions when a
  // function is added above them", "keeps production ids stable ..."
  test.each(['build', 'dev'] as const)(
    '%s: ids of existing server fns survive adding one above them',
    async (mode) => {
      const existing = `export const load = createServerFn().handler(async () => 1)
export const save = createServerFn().handler(async () => 2)`
      const before = await idsOf(existing, { mode })
      const after = await idsOf(
        `export const added = createServerFn().handler(async () => 0)\n${existing}`,
        { mode },
      )
      expect(after).toHaveLength(3)
      expect(after).toEqual(expect.arrayContaining(before))
    },
  )

  // Source: SolidStart compile.spec.ts "does not ship source names in production ids"
  test('build ids do not ship source names', async () => {
    const [id] = await idsOf(
      `export const loadSecretReport = createServerFn().handler(async () => 1)`,
    )
    for (const text of [
      id!,
      Buffer.from(id!, 'base64url').toString('latin1'),
    ]) {
      expect(text).not.toMatch(/loadSecretReport|module|src/)
    }
  })

  // Source: SolidStart compile.spec.ts "tells apart two functions that share a
  // name", "keeps client and server ids aligned"
  test('server fns that share a name in different files get distinct ids the provider uses', async () => {
    const code = `${head}export const load = createServerFn().handler(async () => 1)`
    const ids: Array<string> = []
    for (const id of ['/test/src/a.tsx', '/test/src/b/a.tsx']) {
      const [functionId] = Object.keys(
        (await compileFor('client', code, { id })).serverFns,
      )
      const provider = await evaluateProvider(await compileServer(code, { id }))
      expect(handlersByName(provider).load!.meta.id).toBe(functionId)
      ids.push(functionId!)
    }
    expect(new Set(ids).size).toBe(2)
  })

  // Source: Next.js server-actions fixtures server-graph/66, client-graph/15
  test('non-ASCII and symbol-like server fn names', async () => {
    const names = ['ñandú', '𝑓', 'ᾩ', '$', '_', '$fn']
    const compiled = await compileAll(
      head +
        names
          .map(
            (name) =>
              `export const ${name} = createServerFn().handler(async () => '${name}')`,
          )
          .join('\n'),
    )
    expect(Object.keys(compiled.serverFns)).toHaveLength(names.length)
    const provider = await evaluateProvider(compiled)
    expect(Object.keys(handlersByName(provider)).sort()).toEqual(
      [...names].sort(),
    )
    for (const name of names) {
      expect(await callProvider(provider, name)).toBe(name)
    }
  })
})

describe('module formats', () => {
  // The provider appends its exports after the last statement.
  // Source: Waku vite-plugin-allow-server.test.ts "transforms with trailing
  // comment without new lines"
  test.each([
    { end: '\n// trailing', mode: 'build' },
    { end: '\r\n// trailing', mode: 'build' },
    { end: '\n// trailing', mode: 'dev' },
  ] as const)(
    '$mode: a provider for a module ending in a line comment without a newline: $end',
    async ({ end, mode }) => {
      const server = await compileServer(
        `${head}export const fn = createServerFn().handler(async () => 'handler')${end}`,
        { mode },
      )
      expect(await callProvider(server, 'fn')).toBe('handler')
    },
  )

  // .cts/.mts sources are TypeScript without JSX.
  // Source: @vitejs/plugin-rsc cjs.test.ts (fixtures/cjs)
  test.each(['/test/src/fn.cts', '/test/src/fn.mts'])(
    '%s may use angle-bracket type assertions',
    async (id) => {
      const compiled = await compileAll(
        `${head}import { db } from './db.server'
const n = <number>(1 as unknown)
export const fn = createServerFn().handler(async () => [n, db.x()])`,
        { id },
      )
      expect(importSources(compiled.client)).toEqual([])
      expect(
        await callServerFnThroughCallers(compiled, (module) => module.fn, {
          './db.server': { db: { x: () => 'x' } },
        }),
      ).toEqual([1, 'x'])
    },
  )
})
