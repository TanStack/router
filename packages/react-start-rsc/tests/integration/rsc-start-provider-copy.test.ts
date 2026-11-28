/**
 * The provider's copy of a plain module (Vite's `rsc` environment, Rsbuild's
 * RSC layer) takes the load-time code that fills the state its server fn
 * reads, as `main`'s provider runs the whole file, and the server fn answers
 * the page; the SSR environment's copy (a caller: its handlers are stubs)
 * still renders with the state its own exports read. One row per module of
 * `src/rows/`, each a button of the page.
 */
import { aroundAll, describe, expect, test } from 'vitest'
import { openRscBuild, openRscPage, waitForHydration } from './rsc-app'
import type { RscPreviewServer } from './rsc-app'

/** Each row: a module of `src/rows/`, what its server fn answers the page, and what its `ssr()` renders. */
const rows: Array<{
  name: string
  source: string
  answers: unknown
  renders?: string
}> = [
  {
    name: 'a declaration only its own text names',
    source: `const routes: Array<string> = []
console.info('provider-copy', routes.length)
const reg: any = (routes.push('x'), { again: () => reg })
export const fn = createServerFn().handler(async () => routes.length)
`,
    answers: 1,
  },
  {
    name: 'a cache a handler fills and an export reads',
    source: `import { db } from '../db.server'
const cache = new Map<string, number>()
export const fn = createServerFn().handler(async () => { cache.set('k', db.q()); return cache.get('k') })
export const ssr = () => String(cache.get('k') ?? 'none')
`,
    answers: 1,
    renders: 'none',
  },
  {
    name: 'a function only the handler calls, assigning a kept let',
    source: `import { db } from '../db.server'
let cache: Map<string, number> | null = null
function clear() { cache = null }
export function getCache() { return (cache ??= new Map()) }
export const fn = createServerFn().handler(async () => { clear(); return db.q() })
export const ssr = () => String(getCache().size)
`,
    answers: 1,
    renders: '0',
  },
  {
    name: 'a method call writing state only the handler reads',
    source: `import { db } from '../db.server'
const cache = new Map() as any
export const fn = createServerFn().handler(async () => cache.get('warm') ?? db.q())
cache.set('warm', 'warm')
`,
    answers: 'warm',
  },
  {
    name: 'an assignment writing state only the handler reads',
    source: `import { db } from '../db.server'
const cache = new Map() as any
export const fn = createServerFn().handler(async () => cache.warm ?? db.q())
cache.warm = 'warm'
`,
    answers: 'warm',
  },
  {
    name: 'the server fn stored in state only the handler reads',
    source: `import { db } from '../db.server'
const cache = new Map() as any
export const fn = createServerFn().handler(async () => typeof cache.get('warm') === 'function' ? 'stored' : db.q())
cache.set('warm', fn)
`,
    answers: 'stored',
  },
  {
    name: 'a registry filled through a helper',
    source: `const registry = new Map<string, number>()
function register(k: string, v: number) { registry.set(k, v) }
register('a', 1)
export const fn = createServerFn().handler(async () => registry.get('a'))
`,
    answers: 1,
  },
  {
    name: 'a class static block',
    source: `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const fn = createServerFn().handler(async () => routes.length)
`,
    answers: 1,
  },
  {
    name: 'a never-read declaration',
    source: `const registry = new Map<string, number>()
const _boot = registry.set('a', 1)
export const fn = createServerFn().handler(async () => registry.get('a'))
`,
    answers: 1,
  },
  {
    name: 'a default-export expression',
    source: `let ready = 'no'
export default (ready = 'yes')
export const fn = createServerFn().handler(async () => ready)
`,
    answers: 'yes',
  },
  {
    name: 'the default export',
    source: `import { db } from '../db.server'
const fn = createServerFn().handler(async () => db.q())
export default fn
export { fn }
`,
    answers: 1,
  },
  {
    name: 'a server fn hoisted from an assignment, its chain reading module bindings',
    source: `import { createMiddleware } from '@tanstack/react-start'
import { db } from '../db.server'
const METHOD = 'POST'
const mw = createMiddleware().server(({ next }) => next())
export let fn: any
fn = createServerFn({ method: METHOD }).middleware([mw]).handler(async () => db.q())
`,
    answers: 1,
  },
  {
    name: 'a handler called with a second argument',
    source: `import { db } from '../db.server'
export const fn = (createServerFn() as any).handler(async () => 'first', async () => db.q())
`,
    answers: 'first',
  },
]

const files = {
  'src/db.server.ts': `export const db = { q: () => 1 }\n`,
  ...Object.fromEntries(
    rows.map((row, i) => [
      `src/rows/r${i}.ts`,
      `import { createServerFn } from '@tanstack/react-start'\n${row.source}`,
    ]),
  ),
  'src/routes/provider-copy.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
${rows.map((_, i) => `import * as r${i} from '../rows/r${i}'`).join('\n')}
const rows = [${rows.map((_, i) => `r${i}`).join(', ')}] as Array<any>
export const Route = createFileRoute('/provider-copy')({
  component: Page,
})
function Page() {
  const [called, setCalled] = useState<Record<number, string>>({})
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      {rows.map((row, i) => (
        <div key={i}>
          <p data-testid={'rendered-' + i}>{row.ssr ? row.ssr() : ''}</p>
          <p data-testid={'called-' + i}>called {called[i] ?? ''}</p>
          <button
            data-testid={'call-' + i}
            onClick={() =>
              row.fn().then(
                (v: unknown) => setCalled((c) => ({ ...c, [i]: JSON.stringify(v) })),
                (e: Error) => setCalled((c) => ({ ...c, [i]: String(e?.message) })),
              )
            }
          >
            call
          </button>
        </div>
      ))}
    </main>
  )
}
`,
}

describe.each(['vite', 'rsbuild'] as const)('a %s build', (bundler) => {
  let server: RscPreviewServer

  aroundAll(async (runSuite) => {
    server = await openRscBuild({
      bundler,
      files,
    })
    try {
      await runSuite()
    } finally {
      await server.close()
    }
  })

  test.for(rows.map((row, i) => ({ ...row, i })))(
    'a server fn reads its state: $name',
    async ({ i, answers, renders }) => {
      const opened = await openRscPage(server, '/provider-copy')
      await opened
        .locator('[data-testid=label]', { hasText: /MARK_PAGE/ })
        .waitFor()
      await waitForHydration(opened)
      if (renders !== undefined) {
        expect(
          await opened.locator(`[data-testid=rendered-${i}]`).textContent(),
        ).toBe(renders)
      }
      await opened.locator(`[data-testid=call-${i}]`).click()
      await opened
        .locator(`[data-testid=called-${i}]`, {
          // (exactly: the answers' JSON, escaped as a pattern)
          hasText: new RegExp(
            `^called ${JSON.stringify(answers).replace(/[[\]{}()*+?.\\^$|]/g, '\\$&')}$`,
          ),
        })
        .waitFor()
    },
  )
})
