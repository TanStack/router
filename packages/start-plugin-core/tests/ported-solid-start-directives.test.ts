/**
 * Edge cases ported from SolidStart's `"use server"` directive compiler
 * (solidjs/solid-start, MIT): packages/start/src/directives (`compile.spec.ts`
 * and the `validate`, `remove-unused-variables` and `get-hierarchical-name`
 * helpers). Each test names the SolidStart test or helper whose scenario it
 * translates to `createServerFn`, the env-only functions or `<Hydrate>`.
 */
import { describe, expect, test } from 'vitest'
import {
  clientOnlyError as clientOnly,
  compileAll,
  compileFor,
  compileHydrate as compileHydrateModule,
  frameworks,
  getChunkParams,
  importModule,
  importSources,
  renderChunk,
  serverOnlyError as serverOnly,
  settle,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'

describe.each(frameworks)('ported SolidStart directives (%s)', (framework) => {
  const start = `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from '@tanstack/${framework}-start'`

  // compile.spec.ts: "removes an import when only type specifiers remain"
  test.each([
    `import { type Session, verify } from './server-module'`,
    `import type { Session } from './server-module'\nimport { verify } from './server-module'`,
  ])(
    'callers drop an import whose remaining specifiers are types: %s',
    async (imports) => {
      const compiled = await compileAll(
        `${start}
${imports}
export const serverAction = createServerFn().handler(async (): Promise<Session | null> => verify())`,
        { framework },
      )
      expect(importSources(compiled.client)).toEqual([])
      expect(importSources(compiled.ssr)).toEqual([])
      expect(importSources(compiled.provider)).toEqual(['./server-module'])
    },
  )

  // compile.spec.ts: "preserves live value specifiers from a mixed import"
  test.each([
    {
      imports: `import { type Session, clientValue, verify } from './server-module'`,
      call: 'verify()',
    },
    {
      imports: `import verify, { type Session, clientValue } from './server-module'`,
      call: 'verify()',
    },
  ])(
    'callers keep the live value specifiers of a mixed import: $imports',
    async ({ imports, call }) => {
      const compiled = await compileAll(
        `${start}
${imports}
export const value = clientValue
export const serverAction = createServerFn().handler(async (): Promise<Session | null> => ${call})`,
        { framework },
      )
      const modules = {
        './server-module': `export const clientValue = 'client'; export const verify = () => 'verified'; export default verify`,
      }
      for (const caller of [compiled.client, compiled.ssr]) {
        expect(caller).not.toMatch(/\bverify\b/)
        expect((await importModule(caller, modules)).value).toBe('client')
      }
      const provider = await importModule(compiled.provider, modules)
      expect(
        await provider.serverAction_createServerFn_handler({ data: undefined }),
      ).toBe('verified')
    },
  )

  // validate.ts (assertHoistable) and the "unsupported server functions"
  // tests: SolidStart rejects these captures because it hoists the function.
  // Env-only functions stay where they are written, so every capture works.
  test.each<{
    name: string
    code: string
    run: (module: Record<string, any>) => unknown
    client: unknown
    server: unknown
  }>([
    {
      name: 'a value captured from an enclosing function',
      code: `import { db } from './db.server'
export function makeCounter(start: number) {
  return createServerOnlyFn(() => start + db.count())
}
export function makeLabel(start: number) {
  return createClientOnlyFn(() => 'client:' + start)
}`,
      run: (m) => [
        settle(() => m.makeCounter(1)()),
        settle(() => m.makeLabel(2)()),
      ],
      client: [serverOnly, 'client:2'],
      server: [42, clientOnly],
    },
    {
      name: 'a value captured from a surrounding block',
      code: `export function handlers(items: Array<number>) {
  return items.map((item) => createServerOnlyFn(() => item))
}
export function doubled(items: Array<number>) {
  return items.map((item) => createIsomorphicFn().server(() => item * 2).client(() => item * 3))
}`,
      run: (m) => [
        m.handlers([1, 2]).map((fn: () => unknown) => settle(fn)),
        m.doubled([1, 2]).map((fn: () => unknown) => fn()),
      ],
      client: [
        [serverOnly, serverOnly],
        [3, 6],
      ],
      server: [
        [1, 2],
        [2, 4],
      ],
    },
    {
      name: '`this` in an arrow inside a class',
      code: `export class Api {
  x = 1
  read = createServerOnlyFn(() => this.x)
  both = createIsomorphicFn().server(() => this.x + 10).client(() => this.x + 20)
}`,
      run: (m) => {
        const api = new m.Api()
        return [settle(() => api.read()), api.both()]
      },
      client: [serverOnly, 21],
      server: [1, 11],
    },
    {
      name: '`arguments` in an arrow inside a function',
      code: `export function outer(..._args: Array<unknown>) {
  return createServerOnlyFn(() => arguments.length)
}`,
      run: (m) => settle(() => m.outer(1, 2, 3)()),
      client: serverOnly,
      server: 3,
    },
    {
      name: '`super`',
      code: `class Base {
  name() {
    return 'base'
  }
}
export class Api extends Base {
  read() {
    return createServerOnlyFn(() => super.name())
  }
}`,
      run: (m) => settle(() => new m.Api().read()()),
      client: serverOnly,
      server: 'base',
    },
    {
      name: 'a private class member',
      code: `export class Api {
  #secret = 'secret'
  static #count = 0
  read() {
    return createServerOnlyFn(() => this.#secret)
  }
  static bump = createClientOnlyFn(() => ++Api.#count)
}`,
      run: (m) => [
        settle(() => new m.Api().read()()),
        settle(() => m.Api.bump()),
      ],
      client: [serverOnly, 1],
      server: ['secret', clientOnly],
    },
    {
      // compile.spec.ts: "does not read type annotations as captured values"
      name: 'type annotations naming local types',
      code: `export function outer<T>() {
  type Local = { id: T }
  return createServerOnlyFn((value: Local): Local => value)
}`,
      run: (m) => settle(() => m.outer()({ id: 'a' })),
      client: serverOnly,
      server: { id: 'a' },
    },
  ])(
    'an env-only function keeps $name',
    async ({ code, run, client, server }) => {
      const compiled = await compileAll(`${start}\n${code}`, { framework })
      expect(importSources(compiled.client)).toEqual([])
      const modules = { './db.server': `export const db = { count: () => 41 }` }
      expect(run(await importModule(compiled.client, modules))).toEqual(client)
      for (const output of ['ssr', 'provider'] as const) {
        expect(
          run(await importModule(compiled[output], modules)),
          output,
        ).toEqual(server)
      }
    },
  )
})

describe('ported SolidStart directives', () => {
  const start = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'`

  // compile.spec.ts: "rejects a directive in an object method", "... in a
  // class method", "... in a getter", "supports an anonymous default export".
  // A server fn must be a variable initializer; anywhere else it is rejected
  // in every output instead of being shipped untransformed.
  test.each([
    {
      name: 'an object property',
      code: `export const api = { read: createServerFn().handler(async () => 1) }`,
    },
    {
      name: 'a class field',
      code: `export class Api { read = createServerFn().handler(async () => 1) }`,
    },
    {
      name: 'a static class field',
      code: `export class Api { static read = createServerFn().handler(async () => 1) }`,
    },
    {
      name: 'a getter',
      code: `export const api = { get read() { return createServerFn().handler(async () => 1) } }`,
    },
    {
      name: 'an anonymous default export',
      code: `export default createServerFn().handler(async () => 1)`,
    },
    {
      name: 'an assignment',
      code: `export let fn\nfn = createServerFn().handler(async () => 1)`,
    },
  ])('a server fn in $name is rejected', async ({ code }) => {
    for (const output of ['client', 'ssr', 'provider'] as const) {
      await expect(
        compileFor(output, `${start}\n${code}`),
        output,
      ).rejects.toThrow('createServerFn must be assigned to a variable!')
    }
  })

  describe('server function ids', () => {
    async function idsOf(
      code: string,
      options: Parameters<typeof compileFor>[2] = {},
    ) {
      const { serverFns } = await compileFor(
        'client',
        `${start}\n${code}`,
        options,
      )
      return Object.fromEntries(
        Object.values(serverFns).map((fn) => [fn.functionName, fn.functionId]),
      )
    }

    // compile.spec.ts: "keeps ids of existing functions when a function is
    // added above them", "keeps production ids stable when a function is
    // added above them"
    test.each(['build', 'dev'] as const)(
      'ids of existing server fns survive adding one above them (%s)',
      async (mode) => {
        const existing = `export const load = createServerFn().handler(async () => 1)
export const save = createServerFn().handler(async () => 2)`
        const before = await idsOf(existing, { mode })
        const after = await idsOf(
          `export const added = createServerFn().handler(async () => 0)\n${existing}`,
          { mode },
        )
        expect(Object.keys(after)).toHaveLength(3)
        expect(after).toMatchObject(before)
      },
    )

    // compile.spec.ts: "does not ship source names in production ids"
    test('build ids do not ship source names', async () => {
      const code = `export function Page() {
  return 'page'
}
export const loadSecretReport = createServerFn().handler(async () => 1)`
      const [id] = Object.values(await idsOf(code))
      expect(id).not.toMatch(/loadSecretReport|module|src/)
      const client = await compileFor('client', `${start}\n${code}`)
      expect(client.code).toContain(JSON.stringify(id))
      expect(client.code).not.toContain('loadSecretReport_createServerFn')
    })

    // compile.spec.ts: "tells apart two functions that share a name",
    // "keeps client and server ids aligned"
    test('server fns that share a name in different files get distinct, aligned ids', async () => {
      const code = `${start}\nexport const load = createServerFn().handler(async () => 1)`
      const ids: Array<string> = []
      for (const id of ['/test/src/a.tsx', '/test/src/b/a.tsx']) {
        const client = await compileFor('client', code, { id })
        const [functionId] = Object.keys(client.serverFns)
        const provider = await compileFor('provider', code, { id })
        expect(provider.code).toContain(JSON.stringify(functionId))
        ids.push(functionId!)
      }
      expect(new Set(ids).size).toBe(2)
    })
  })

  // Regression in the Yuku compiler (#8504): a namespace that is only read
  // through a TypeScript import alias (`import red = Labels.red`) is deleted
  // as unused, in every output, whether or not the alias is used. The alias
  // compiles to `var red = Labels.red`. Impact: the module throws
  // `ReferenceError: Labels is not defined` when it is evaluated.
  // plugin.ts isTypeOnlyDeclaration (TSModuleDeclaration exports)
  test('a namespace read through an import alias stays declared', async () => {
    const compiled = await compileAll(`${start}
namespace Labels {
  export const red = 'red'
}
import red = Labels.red
export const label = red
export const read = createServerOnlyFn(() => red)
export const fn = createServerFn().handler(async () => red)`)
    const client = await importModule(compiled.client)
    expect(client.label).toBe('red')
    expect(settle(() => client.read())).toBe(serverOnly)
    const ssr = await importModule(compiled.ssr)
    expect(ssr.read()).toBe('red')
    const provider = await importModule(compiled.provider)
    expect(await provider.fn_createServerFn_handler({})).toBe('red')
  })
})

/** Compiles a module with `<Hydrate>` for the client and checks every module. */
async function compileHydrate(code: string) {
  const { parent, chunks } = await compileHydrateModule('client', code)
  for (const module of [parent, ...chunks]) {
    expect(await getModuleErrors(module)).toEqual([])
  }
  return { parent, chunks }
}

describe('ported SolidStart directives: Hydrate children captures', () => {
  // validate.ts (assertHoistable): "does not read type annotations as
  // captured values". Split children move to a module-level chunk component,
  // so only runtime values may become props.
  test('local types used by split children are not passed as props', async () => {
    const { parent, chunks } =
      await compileHydrate(`import { Hydrate } from '@tanstack/react-start'
function List<T>(props: { items: Array<T> }) {
  return <ul>{props.items.length}</ul>
}
export function Page() {
  type Item = { id: string }
  interface Shape { id: string }
  const items = [{ id: 'a' }]
  return <Hydrate><List<Item> items={items as Array<Shape>} /><p>{(items[0] satisfies Item).id}</p></Hydrate>
}`)
    expect(chunks).toHaveLength(1)
    expect(getChunkParams(chunks[0]!)).toEqual(['items'])
    expect(parent).not.toMatch(/\b(?:Item|Shape)=\{/)
    expect(await renderChunk(chunks[0]!, { items: [{ id: 'a' }] })).toBe(
      '<ul>1</ul><p>a</p>',
    )
  })

  // compile.spec.ts: "allows module scope, globals, parameters and locals",
  // "allows `this` and `arguments` in a function expression";
  // get-hierarchical-name.ts (same name in nested scopes)
  test('split children read module scope, globals, defaulted params, local classes and shadowed names', async () => {
    const { chunks } =
      await compileHydrate(`import { Hydrate } from '@tanstack/react-start'
const label = 'module'
export function Page({ suffix = '!' }: { suffix?: string }) {
  class Local {
    static label = 'local'
  }
  return <>
    <Hydrate><p>{label + suffix}</p></Hydrate>
    <Hydrate><p>{Local.label + Math.max(1, 2)}</p></Hydrate>
    {(() => {
      const label = 'inner'
      return <Hydrate><b>{label}</b></Hydrate>
    })()}
    <Hydrate><i>{(function (..._args: Array<unknown>) { return arguments.length })(1, 2)}</i></Hydrate>
  </>
}`)
    expect(chunks.map(getChunkParams)).toEqual([
      ['suffix'],
      ['Local'],
      ['label'],
      [],
    ])
    expect(
      await Promise.all([
        renderChunk(chunks[0]!, { suffix: '!' }),
        renderChunk(chunks[1]!, {
          Local: class {
            static label = 'local'
          },
        }),
        renderChunk(chunks[2]!, { label: 'inner' }),
        renderChunk(chunks[3]!),
      ]),
    ).toEqual(['<p>module!</p>', '<p>local2</p>', '<b>inner</b>', '<i>2</i>'])
  })
})
