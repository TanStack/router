/**
 * The compile-level RSC tier on Vite (`useStartHost({ rsc: true })`: Start's
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
 * - import protection's `'use client'` exception: a `'use client'` module's
 *   imports are judged where its code runs, not in the provider (SPEC J6.1;
 *   the dev and build apps are react-start-rsc's rsc-use-client-*);
 * - RSC CSS: the Flight stream a module renders names the stylesheet the
 *   module imports, for each JSX leaf of a conditional (SPEC J7.2, J7.3;
 *   the page-level matrix is react-start-rsc's rsc-css-*).
 * The Rsbuild counterparts (two layers of one environment) are
 * `integration/rsbuild/rsc-layers.test.ts`.
 * Source: RSC investigation (11-19: no compile-level row compiled an `rsc`
 * environment).
 */
import { describe, expect, test } from 'vitest'
import { useStartHost } from './start-host'

describe('Vite with RSC: client references', () => {
  const host = useStartHost({ rsc: true })

  // SPEC J4.17: the compiler keeps the directive, so the RSC plugin makes
  // the module's exports client references in the provider; SSR and the
  // client get the component.
  test("a 'use client' module is a client reference in the rsc environment and a component in SSR and the client", async () => {
    const c = await (
      await host()
    ).case({
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
  const host = useStartHost({ rsc: true })

  const serverFnModule = {
    'module.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_GREET_HANDLER')
`,
  }

  // SPEC J4.12: SSR and the client get callers, never the handler.
  test('SSR and the client serve no handler', async () => {
    const c = await (await host()).case(serverFnModule)
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
      const c = await (await host()).case(serverFnModule)
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

describe("Vite with RSC: import protection's 'use client' exception", () => {
  const violations: Array<{
    env: string
    importer: string
    specifier: string
  }> = []
  const host = useStartHost({
    rsc: true,
    start: {
      importProtection: {
        behavior: 'mock',
        onViolation: (info: {
          env: string
          importer: string
          specifier: string
        }) => {
          violations.push(info)
        },
      },
    },
  })

  // SPEC J6.1: the provider compiles the module, which the RSC plugin
  // replaces by client references: nothing of its code runs there, so its
  // `.client` import is no violation in the rsc environment; SSR runs it,
  // so it is one there (and SSR gets the mock).
  test("a 'use client' module's .client import is judged in SSR, not in the rsc environment", async () => {
    const c = await (
      await host()
    ).case({
      'label.client.ts': `export const label = () => 'MARK_CLIENT_LABEL'\n`,
      'module.tsx': `'use client'
import { label } from './label.client'
export function Box() {
  return <span>{label()}</span>
}
`,
    })
    const reported = () =>
      violations
        .filter(({ importer }) => importer.includes(c.dir))
        .map(({ env, specifier }) => `${env} ${specifier}`)
    const rsc = await c.rsc()
    expect(rsc.Box.$$typeof).toBe(Symbol.for('react.client.reference'))
    expect(reported()).toEqual([])
    await c.ssr()
    expect(reported()).toEqual(['ssr ./label.client'])
  })
})

describe('Vite with RSC: RSC CSS', () => {
  const host = useStartHost({ rsc: true })

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
      const c = await (await host()).case(streamModule)
      const payload = await text(render(await c.rsc()))
      expect(payload).toContain('MARK_')
      expect(payload).toContain(c.url('page.css'))
    },
  )
})
