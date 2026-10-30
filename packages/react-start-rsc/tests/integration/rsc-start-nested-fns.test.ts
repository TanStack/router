/**
 * A server fn created inside a function (SPEC J4.6) with a separate
 * provider (Vite's `rsc` environment, Rsbuild's RSC layer): hoisted into the
 * provider when its chain captures nothing of the enclosing function, so the
 * function runs in every environment and the handler runs in the provider;
 * a capture is a positioned compile error in every environment.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  openRscPage,
  startRscDevServer,
  startRscRsbuildDevServer,
  waitForHydration,
} from './rsc-app'

/** `make()` creates a server fn whose chain reads module bindings only. */
const hoistable = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
const METHOD = 'POST'
export function make() {
  const fn = createServerFn({ method: METHOD }).handler(async () => secret())
  return fn
}
`

/** Chains capturing a binding of the enclosing function, and where. */
const capturing = [
  {
    name: 'a parameter in the handler',
    code: `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
export function make(id: string) {
  const fn = createServerFn().handler(async () => secret(id))
  return fn
}
`,
    at: 'id))',
  },
  {
    name: 'a local const in the handler',
    code: `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
export function make() {
  const scope = 'a'
  const fn = createServerFn().handler(async () => secret(scope))
  return fn
}
`,
    at: 'scope))',
  },
  {
    name: 'a hook result in the handler',
    code: `import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { secret } from './secret'
export function Comp() {
  const [count] = useState('a')
  const fn = createServerFn().handler(async () => secret(count))
  return fn
}
`,
    at: 'count))',
  },
]

const files = {
  'src/secret.ts': `export const secret = (x = 'MARK_NESTED') => x\n`,
  'src/fns.ts': hoistable,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { make } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => make()(),
  component: Page,
})
function Page() {
  return <p data-testid="label">loaded {Route.useLoaderData()}</p>
}
`,
}

/** 1-based line and column of `at` in `code`. */
function positionOf(code: string, at: string) {
  const offset = code.indexOf(at)
  expect(offset, `${at} in the source`).toBeGreaterThanOrEqual(0)
  const before = code.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}

describe('Vite dev with a separate RSC provider', () => {
  test('a server fn nested in a function runs in every environment when its chain captures nothing', async () => {
    const server = await startRscDevServer({ browser: true, files })
    // the `rsc` environment evaluates the module and the function (the
    // factory, the options and the stub it reads stay with the chain)
    const inProvider = await server.import('/src/fns.ts', 'rsc')
    expect(typeof inProvider.make()).toBe('function')
    const inSsr = await server.import('/src/fns.ts', 'ssr')
    expect(typeof inSsr.make()).toBe('function')
    const page = await openRscPage(server, '/')
    await page.waitForText('loaded MARK_NESTED', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(page)
    expect(page.errors).toEqual([])
    const client = await server.transform('/src/fns.ts', 'client')
    expect(client).not.toContain('MARK_NESTED')
    expect(client).not.toContain('./secret')
  })

  test.each(capturing)(
    'a server fn nested in a function capturing $name is a compile error in every environment',
    async ({ code, at }) => {
      const server = await startRscDevServer({
        files: { ...files, 'src/fns.ts': code },
      })
      const position = positionOf(code, at)
      for (const environment of ['client', 'ssr', 'rsc']) {
        const mark = server.diagnostics.length
        const thrown = await server.transform('/src/fns.ts', environment).then(
          () => undefined,
          (error: unknown) => error,
        )
        expect(thrown, `${environment} serves the module`).toBeDefined()
        expectDiagnostic(
          [...diagnosticsOf(thrown), ...server.diagnostics.slice(mark)],
          {
            severity: 'error',
            file: 'src/fns.ts',
            root: server.root,
            position,
          },
        )
      }
    },
  )
})

describe('Rsbuild dev with an RSC layer', () => {
  test('a server fn nested in a function runs when its chain captures nothing, and a capture is a compile error', async () => {
    const server = await startRscRsbuildDevServer({ browser: true, files })
    expect(server.errors).toEqual([])
    const page = await openRscPage(server, '/')
    await page.waitForText('loaded MARK_NESTED', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(page)
    expect(page.errors).toEqual([])
    const client = Object.values(await server.outputs('client')).join('\n')
    expect(client).not.toContain('MARK_NESTED')

    for (const { code, at } of capturing) {
      const mark = server.diagnostics.length
      const thrown = await server.edit({ 'src/fns.ts': code }).then(
        () => undefined,
        (error: unknown) => error,
      )
      expectDiagnostic(
        [...diagnosticsOf(thrown), ...server.diagnostics.slice(mark)],
        {
          severity: 'error',
          file: 'src/fns.ts',
          root: server.root,
          position: positionOf(code, at),
        },
      )
    }
  })
})
