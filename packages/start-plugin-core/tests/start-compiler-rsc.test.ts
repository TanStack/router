/**
 * The compile-level RSC tier on Vite (`createStartHost({ rsc: true })`: Start's
 * `rsc: { enabled: true }` and `@vitejs/plugin-rsc`, a dev server whose
 * `rsc` environment renders server components and is Start's server-fn
 * provider). A case module is compiled and evaluated in each environment,
 * read by what a user gets: what an environment serves, what its module
 * exports, what a call answers.
 * - client references: a `'use client'` module is a client reference where
 *   server components render and a component in SSR and the client (SPEC
 *   J4.17);
 * - the server-fn provider: SSR and the client serve callers only, and the
 *   provider registers the handler: SSR and the browser reach it by id
 *   (SPEC J4.1, J4.2, J4.12);
 * - import protection's `'use client'` exception: in
 *   start-compiler-rsc-import-protection.test.ts (a host of its own, in a
 *   process of its own);
 * - RSC CSS: the Flight stream a module renders names the stylesheet the
 *   module imports, for each JSX leaf of a conditional (SPEC J7.2, J7.3;
 *   the page-level matrix is react-start-rsc's rsc-css-*).
 * - dead-code removal on both servers: the SSR caller and the provider each
 *   evaluate the module-level definitions their own code reads (SPEC G16).
 * The Rsbuild counterparts (two layers of one environment) are
 * `integration/rsbuild/rsc-layers.test.ts`.
 * Source: RSC investigation (11-19: no compile-level row compiled an `rsc`
 * environment).
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from './file-end'
import { createStartHost } from './start-host'
import type { StartHost } from './start-host'

describe('Vite with RSC: client references', () => {
  let host: StartHost
  const openHost = closeAfterAll()
  beforeAll(async () => {
    host = await openHost(() => createStartHost({ rsc: true }))
  }, 60_000)

  // SPEC J4.17: the compiler keeps the directive, so the RSC plugin makes
  // the module's exports client references in the provider; SSR and the
  // client get the component.
  test("a 'use client' module is a client reference in the rsc environment and a component in SSR and the client", async () => {
    const c = await host.case({
      'module.tsx': `'use client'
export function Box() {
  return <span>MARK_BOX_BODY</span>
}
`,
    })
    const rsc = await c.rsc()
    expect(rsc.Box.$$typeof).toBe(Symbol.for('react.client.reference'))
    expect(await c.served('module.tsx', 'rsc')).not.toContain('MARK_BOX_BODY')
    const ssr = await c.ssr()
    expect(typeof ssr.Box).toBe('function')
    expect(ssr.Box.$$typeof).toBeUndefined()
    const client = await c.client<string>(`return typeof module.Box`)
    expect(client.result).toBe('function')
  })
})

describe('Vite with RSC: the server-fn provider', () => {
  let host: StartHost
  const openHost2 = closeAfterAll()
  beforeAll(async () => {
    host = await openHost2(() => createStartHost({ rsc: true }))
  }, 60_000)

  const serverFnModule = {
    'module.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_GREET_HANDLER')
`,
  }

  // SPEC J4.12: SSR and the client get callers, never the handler.
  test('SSR and the client serve no handler', async () => {
    const c = await host.case(serverFnModule)
    expect(await c.served('module.ts', 'ssr')).not.toContain(
      'MARK_GREET_HANDLER',
    )
    expect(await c.served('module.ts', 'client')).not.toContain(
      'MARK_GREET_HANDLER',
    )
  })

  // SPEC J4.1, J4.2: the provider registers the server fn: SSR's caller
  // and the browser's reach the handler by id.
  test(
    'a server fn called from SSR and from the browser runs the handler of the provider',
    { timeout: 15_000 },
    async () => {
      const c = await host.case(serverFnModule)
      expect(
        await c.inRequest(async () => (await c.ssr('module.ts')).greet()),
      ).toBe('MARK_GREET_HANDLER')
      const client = await c.client(`return settle(() => module.greet())`, {
        file: 'module.ts',
      })
      expect(client.result).toEqual({ value: 'MARK_GREET_HANDLER' })
    },
  )
})

// With RSC, a server fn's handler runs in the provider (the `rsc`
// environment), which copies the module-level definitions it reads; SSR's
// module calls it and keeps what its own code reads. One pattern can feed
// both: each side evaluates the defaults its code needs, and no other (M5,
// P4; Astra As6). (The dead-code removal rule's other rows:
// start-compiler-removal-definitions.test.ts.)
describe('RSC: the caller and the provider', () => {
  let host: StartHost
  const openHost3 = closeAfterAll()
  beforeAll(async () => {
    host = await openHost3(() => createStartHost({ rsc: true }))
  }, 60_000)
  const record = `export const calls: Array<string> = []
export const record = (name: string) => {
  calls.push(name)
  return name
}
`
  test.each([
    {
      name: 'a pattern with a leaf for a client-only fn and one for the handler',
      code: `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'
import { record } from './record'
const { clientOnly = record('client'), serverOnly = record('server'), kept } = (globalThis as any).removalCfg ?? {}
export const c = createClientOnlyFn(() => clientOnly)
export const fn = createServerFn().handler(async () => serverOnly)
export const k = kept
`,
    },
    {
      name: 'a pattern whose handler leaf is read through a helper',
      code: `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'
import { record } from './record'
const { clientOnly = record('client'), serverOnly = record('server'), kept } = (globalThis as any).removalCfg ?? {}
function read() { return serverOnly }
export const c = createClientOnlyFn(() => clientOnly)
export const fn = createServerFn().handler(async () => read())
export const k = kept
`,
    },
  ])('$name', { timeout: 15_000 }, async ({ code }) => {
    const c = await host.case({
      'module.tsx': code,
      'record.ts': record,
    })
    const ssr = await c.ssr()
    expect([...(await c.ssr('record.ts')).calls]).toEqual([])
    expect(await c.inRequest(() => ssr.fn())).toBe('server')
    expect([...(await c.ssr('record.ts')).calls]).toEqual([])
    expect([...(await c.rsc('record.ts')).calls]).toEqual(['server'])
    const client = await c.client(`module.c()
return [...(await load('record.ts')).calls]`)
    expect(client.result).toEqual(['client'])
  })
})

describe('Vite with RSC: RSC CSS', () => {
  let host: StartHost
  const openHost4 = closeAfterAll()
  beforeAll(async () => {
    host = await openHost4(() => createStartHost({ rsc: true }))
  }, 60_000)

  /**
   * A module that imports its own stylesheet (no component of its own, so
   * the RSC plugin's per-component CSS does not apply) and renders a Flight
   * stream: `direct` of an element, `ternary` of a conditional's branch.
   */
  const streamModule = {
    'page.css': `.page { color: rgb(1, 2, 3); }\n`,
    'module.tsx': `import { renderToReadableStream } from '@tanstack/react-start/rsc'
import './page.css'
export const direct = () => renderToReadableStream(<div className="page">MARK_DIRECT</div>)
export const ternary = (flag: boolean) =>
  renderToReadableStream(flag ? <span className="page">MARK_TRUE</span> : <div className="page">MARK_FALSE</div>)
`,
  }

  const text = async (stream: ReadableStream | Promise<ReadableStream>) =>
    new Response(await stream).text()

  // SPEC J7.2, J7.3: the stream the provider renders carries the module's
  // stylesheet, for each JSX leaf of a conditional too (the browser loads
  // the stylesheet the payload names).
  test.for([
    { name: 'an element', render: (m: Record<string, any>) => m.direct() },
    {
      name: "a conditional's true branch",
      render: (m: Record<string, any>) => m.ternary(true),
    },
    {
      name: "a conditional's false branch",
      render: (m: Record<string, any>) => m.ternary(false),
    },
  ])(
    'renderToReadableStream of $name carries the stylesheet of its module',
    async ({ render }) => {
      const c = await host.case(streamModule)
      const payload = await text(render(await c.rsc()))
      expect(payload).toContain('MARK_')
      expect(payload).toContain(c.url('page.css'))
    },
  )
})
