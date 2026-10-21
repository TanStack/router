import { describe, expect, test, vi } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import {
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  directivePrologue,
  inPage,
  serveCase,
  serverFnUrls,
  useStartHost,
} from '../regression-helpers'

// Callers keep the module's exports: the client gets each server fn as an
// RPC, and calling one from server code runs its handler; a client call
// reaches the handler by id through Start's server entry, wherever the
// handler lives on the server (SPEC J4.2, §5.4). Module directives, ids and
// module formats must survive these rewrites.
//
// Moved to integration/start-compiler-build-ids.test.ts (production builds):
// "build providers have no dev HMR code", the build row of "ids are
// repeatable for unchanged input ...", "build ids do not ship source names"
// and the two build rows of "a provider for a module ending in a line
// comment without a newline".

const host = useStartHost()

const head = `import { createServerFn } from '@tanstack/react-start'\n`

describe('export forms', () => {
  // Source: Next.js server-actions fixtures server-graph/9, /12, /13, /29,
  // /66, /69, client-graph/4, /15
  test('callers keep every export form, each server fn running its own handler', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}const a = createServerFn().handler(async () => 'a')
const b = createServerFn().handler(async () => 'b')
const c = createServerFn().handler(async () => 'c')
export const d = createServerFn().handler(async () => 'd'),
  notAServerFn = 1
export let e = createServerFn().handler(async () => 'e')
export var f = createServerFn().handler(async () => 'f')
export { a as default, b as named, c as as }`,
    })
    const exported = {
      default: 'a',
      named: 'b',
      as: 'c',
      d: 'd',
      e: 'e',
      f: 'f',
    }
    expect(await inPage(served, 'return module.notAServerFn')).toBe(1)
    // Six server fns, each its own RPC.
    expect(await serverFnUrls(served)).toHaveLength(6)
    for (const [name, local] of Object.entries(exported)) {
      expect(await callFromClient(served, `module.${name}`), name).toBe(local)
    }
    expect((await served.ssr()).notAServerFn).toBe(1)
    for (const [name, local] of Object.entries(exported)) {
      expect(await callOnServer(served, `module.${name}`), name).toBe(local)
    }
  })

  // Source: Next.js server-actions fixtures client-graph/1, server-graph/10, /11, /15
  test.each([
    `export default async function () {\n  return fn()\n}`,
    `export default class {\n  call() {\n    return fn()\n  }\n}`,
  ])('an anonymous default export next to a server fn: %s', async (code) => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export const fn = createServerFn().handler(async () => 1)\n${code}`,
    })
    expect(await inPage(served, 'return typeof module.default')).toBe(
      'function',
    )
    expect(await callFromClient(served, 'module.fn')).toBe(1)
  })

  // E.g. a Vue options-API component or a config object.
  test.each([
    { code: 'export default { a: 1, b: 2 }', value: { a: 1, b: 2 } },
    { code: 'export default 42', value: 42 },
  ])(
    'a default-exported expression next to a server fn: $code',
    async ({ code, value }) => {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}export const fn = createServerFn().handler(async () => 1)\n${code}`,
      })
      expect(await inPage(served, 'return module.default')).toEqual(value)
      expect(await callFromClient(served, 'module.fn')).toBe(1)
    },
  )

  // Source: @vitejs/plugin-rsc source-map/wrap-export/local-export-before-declaration.js
  test('an export list before the server fn declaration', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export { fn, fn as alias }
const fn = createServerFn().handler(async () => 'fn')`,
    })
    expect(
      await inPage(
        served,
        'return [module.alias === module.fn, typeof module.fn.url]',
      ),
    ).toEqual([true, 'string'])
    expect(await callFromClient(served, 'module.fn')).toBe('fn')
  })

  // Source: @vitejs/plugin-rsc source-map/wrap-export/dependent-declarators.js
  test('a server fn built from a sibling declarator', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { db } from './db.server'
export const base = createServerFn(), fn = base.handler(async () => db.x())`,
      'db.server.ts': `export const db = { x: () => 'x' }\n`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callFromClient(served, 'module.fn')).toBe('x')
  })

  // Source: @vitejs/plugin-rsc wrap-export.test.ts "re-export simple",
  // "re-export rename", "re-export all simple", "re-export all rename"
  test('re-exports stay in the callers', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export { x } from './dep'
export { x as y } from './dep'
export * from './star'
export * as ns from './dep'
export const fn = createServerFn().handler(async () => 'fn')`,
      'dep.ts': `export const x = 'x'\n`,
      'star.ts': `export const starred = 'starred'\n`,
    })
    const read = '[module.x, module.y, module.starred, module.ns.x]'
    const expected = ['x', 'x', 'starred', 'x']
    expect(await inPage(served, `return ${read}`)).toEqual(expected)
    const ssr = await served.ssr()
    expect([ssr.x, ssr.y, ssr.starred, ssr.ns.x]).toEqual(expected)
    expect(await callFromClient(served, 'module.fn')).toBe('fn')
  })

  // JSON modules only load with their `type: 'json'` attribute.
  // Source: @vitejs/plugin-rsc source-map/wrap-export/reexport-attributes.js;
  // Turbopack tree-shaker analyzer/import-with-clause
  test('import attributes are kept on the imports and re-exports each output keeps', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import config from './config.json' with { type: 'json' }
import secrets from './secrets.json' with { type: 'json' }
export { default as data } from './data.json' with { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => secrets.key)`,
      'config.json': `{ "theme": "dark" }\n`,
      'data.json': `{ "data": true }\n`,
      'secrets.json': `{ "key": "s3cret" }\n`,
    })
    expectNotLoaded(await served.loads(), ['./secrets.json'])
    expect(await inPage(served, 'return [module.theme, module.data]')).toEqual([
      'dark',
      { data: true },
    ])
    const ssr = await served.ssr()
    expect([ssr.theme, ssr.data]).toEqual(['dark', { data: true }])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('s3cret')
  })

  // Source: Next.js server-actions fixtures server-graph/60, /62, /68, /72
  test('TypeScript-only exports and an enum next to a server fn', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import type { Stuff } from './stuff'
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
export const fn = createServerFn().handler(async (): Promise<Stuff | string> => E.A)`,
      'stuff.ts': 'export type Stuff = number\n',
      'a.ts': 'export type A = string\n',
      'b.ts': 'export type B = string\n',
      'c.ts': 'export type C = string\n',
    })
    expect(await callFromClient(served, 'module.fn')).toBe('a')
  })

  // Source: TanStack/router#6480 (an exported type that reads a schema built
  // from an imported enum kept the enum's server module in the client);
  // replaces router-utils stripTypeExports "handles the issue #6480
  // scenario", which never checked the symptom. The real `zod`.
  test('an exported type reading a schema the handler uses keeps its imports out of the client', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { z } from 'zod'
import { PostCategory } from './PostService'
const postSchema = z.object({ category: z.nativeEnum(PostCategory) })
export type CreatePostInput = z.infer<typeof postSchema>
export const createPost = createServerFn().handler(async () =>
  postSchema.parse({ category: 'news' }),
)`,
      'PostService.ts': `export const PostCategory = { News: 'news' } as const\n`,
    })
    expectNotLoaded(await served.loads(), ['./PostService'])
    expect(await callFromClient(served, 'module.createPost')).toEqual({
      category: 'news',
    })
  })

  // The server may repeat the module's top-level code or run the handler in
  // the module itself; it runs once is the goal pinned in
  // known-bugs-start-compiler.test.ts ("SSR: a server fn module is
  // initialised once ...").
  // Source: Next.js server-actions fixtures client-graph/2
  test('side-effect imports and top-level statements stay in the callers, and the handler runs next to them', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `${head}import './polyfill'
console.log('side-effect-marker')
export const fn = createServerFn().handler(async () => 'fn')`,
      'polyfill.ts': `console.log('polyfill')\nexport {}\n`,
    })
    const ran: Array<string> = []
    vi.spyOn(console, 'log').mockImplementation((marker: string) => {
      ran.push(marker)
    })
    try {
      // The SSR environment evaluates the module (its first evaluation).
      await startCase.ssr()
      expect(ran, 'ssr').toEqual(['polyfill', 'side-effect-marker'])
      // A page importing the module runs the same code.
      const run = await startCase.client('return true')
      expect(
        run.console.filter((message) => message.startsWith('log: ')),
        'client',
      ).toEqual(['log: polyfill', 'log: side-effect-marker'])
      // The handler runs on a server that ran the module's imports.
      expect(await callFromClient(startCase, 'module.fn')).toBe('fn')
      expect(ran).toContain('polyfill')
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('directives', () => {
  // Split (S4 B-mixed): a handler with a directive prologue is a working
  // server fn. Where its directives end up on the server (they have no
  // effect in a module, which is always strict, and outside RSC) is not
  // observable, so the former check of the provider's printed function
  // prologues is dropped (SPEC §5.4, §5.5).
  // Source: Next.js server-actions fixtures server-graph/8
  test('handler directives stay in the provider', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export const fn = createServerFn().handler(async function () {
  'use strict'
  'use server'
  return 1
})`,
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(1)
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
      const startCase = await (await host()).case({ 'module.tsx': code })
      // Each directive still leads the module the client environment
      // serves, read from the parsed module (their order within the
      // prologue is free, SPEC §5.5).
      expect(directivePrologue(await startCase.served()).sort()).toEqual(
        [...directives].sort(),
      )
      expect(await callFromClient(startCase, 'module.fn')).toBe(1)
    },
  )
})

describe('server function ids', () => {
  test('dev providers export the handler', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export const getPosts = createServerFn().handler(async () => 'posts')`,
    })
    expect(await callServerFnThroughCallers(served, 'module.getPosts')).toBe(
      'posts',
    )
  })

  // Ids are repeatable for unchanged input, and within each version of a
  // module the client and the server agree on them (SPEC J4.4, G4). Editing
  // the module (here: adding a server fn above the others) changes the
  // effective input, so ids need not survive the edit. Ids are observed as
  // the public `url` of the server fns the client and server code get.
  // Source: SolidStart compile.spec.ts "keeps ids of existing functions when a
  // function is added above them", "keeps production ids stable ..."
  // (FIX-PLAN S04: their edit-stability is not required).
  test('dev: ids are repeatable for unchanged input, and each version of a module runs its own handlers by id', async () => {
    const existing = `export const load = createServerFn().handler(async () => 'load')
export const save = createServerFn().handler(async () => 'save')`
    const versions = [
      existing,
      `export const added = createServerFn().handler(async () => 'added')\n${existing}`,
    ]
    for (const version of versions) {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}${version}`,
      })
      const names =
        version === existing ? ['load', 'save'] : ['load', 'save', 'added']
      const read = `Object.fromEntries(${JSON.stringify(names)}.map((name) => [name, module[name].url]))`
      const [clientUrls] = await expectDeterministic([1, 2, 3], () =>
        inPage(served, `return ${read}`),
      )
      const ssr = await served.ssr()
      expect(
        Object.fromEntries(names.map((name) => [name, ssr[name].url])),
        'the ids server code gets',
      ).toEqual(clientUrls)
      for (const name of names) {
        expect(
          await callServerFnThroughCallers(served, `module.${name}`),
          name,
        ).toBe(name)
      }
    }
  })

  // Source: SolidStart compile.spec.ts "tells apart two functions that share a
  // name", "keeps client and server ids aligned"
  test('server fns that share a name in different files get distinct ids the provider uses', async () => {
    const code = `${head}export const load = createServerFn().handler(async () => 1)`
    const served = await serveCase(await host(), {
      'a.tsx': code,
      'b/a.tsx': code,
      'module.tsx': `export { load as first } from './a'
export { load as second } from './b/a'
`,
    })
    expect(await serverFnUrls(served)).toHaveLength(2)
    expect([
      await callFromClient(served, 'module.first'),
      await callFromClient(served, 'module.second'),
    ]).toEqual([1, 1])
  })

  // Source: Next.js server-actions fixtures server-graph/66, client-graph/15
  test('non-ASCII and symbol-like server fn names', async () => {
    const names = ['ñandú', '𝑓', 'ᾩ', '$', '_', '$fn']
    const served = await serveCase(await host(), {
      'module.tsx':
        head +
        names
          .map(
            (name) =>
              `export const ${name} = createServerFn().handler(async () => '${name}')`,
          )
          .join('\n'),
    })
    expect(await serverFnUrls(served)).toHaveLength(names.length)
    for (const name of names) {
      expect(
        await callServerFnThroughCallers(
          served,
          `module[${JSON.stringify(name)}]`,
        ),
      ).toBe(name)
    }
  })
})

describe('module formats', () => {
  // The compiler may append code after the module's last statement.
  // Source: Waku vite-plugin-allow-server.test.ts "transforms with trailing
  // comment without new lines"
  test('dev: a provider for a module ending in a line comment without a newline: \n// trailing', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}export const fn = createServerFn().handler(async () => 'handler')\n// trailing`,
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'handler',
    )
  })

  // .mts sources are TypeScript without JSX.
  // No `.cts` row: Vite's TypeScript transform skips `.cts` by default
  // (`vite:oxc` includes `.ts`, `.mts`, `.tsx`, `.jsx`), so a plain Vite app
  // without Start cannot run a `.cts` module with TypeScript syntax in dev
  // either (SSR: "Parse failure: Unexpected JSX expression"; the client gets
  // the TypeScript as is), and its build fails the same way for any query
  // import of a `.cts` module (`./fn.cts?x`). Not a compiler outcome
  // (coordinator 2026-10-21; FOLLOWUPS UPSTREAM "`.cts`").
  // Source: @vitejs/plugin-rsc cjs.test.ts (fixtures/cjs)
  for (const file of ['fn.mts']) {
    test(`${file} may use angle-bracket type assertions`, async () => {
      const served = await serveCase(
        await host(),
        {
          [file]: `${head}import { db } from './db.server'
const n = <number>(1 as unknown)
export const fn = createServerFn().handler(async () => [n, db.x()])`,
          'db.server.ts': `export const db = { x: () => 'x' }\n`,
        },
        { file },
      )
      expectNotLoaded(await served.loads(file), ['./db.server'])
      expect(
        await callServerFnThroughCallers(served, 'module.fn', undefined, {
          file,
        }),
      ).toEqual([1, 'x'])
    })
  }
})
