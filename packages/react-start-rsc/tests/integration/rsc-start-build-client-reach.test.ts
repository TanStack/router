/**
 * A production build of a React Start app with RSC enabled on Vite
 * (`rsc-app.ts`) whose server fns only `'use client'` components import,
 * the components a server component renders (SPEC J4.2, #7943): the
 * provider builds before the client, so it compiles the reach of its
 * server fns' modules before its build and its manifest lists them. Each
 * spelling of a server fn chain the planner accepts runs when the browser
 * calls it, also when the module names no `createServerFn` (an imported
 * builder). And what the early compile must not change: a module a client
 * component's import keeps for its side effects (`verbatimModuleSyntax`)
 * still answers, and a server fn only development code imports adds no
 * production dependency. The first case of each kind is in
 * rsc-start-build.test.ts ("a server fn only a 'use client' component …").
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  openRscPage,
  settledValue,
  startRscPreviewServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RscPreviewServer } from './rsc-app'

/** The server fns the `'use client'` component calls, by test id. */
const shapes = {
  // A typed handler of a builder another module exports: the module names
  // neither `createServerFn` nor `.handler(`.
  typed: `import { base } from './builder'
export const typed = base.handler<string>(() => 'MARK_TYPED')
`,
  parenBuilder: `import { base } from './builder'
export const parenBuilder = (base.handler)(() => 'MARK_PARENBUILDER')
`,
  nonNullBuilder: `import { base } from './builder'
export const nonNullBuilder = base.handler!(() => 'MARK_NONNULLBUILDER')
`,
  paren: `import { createServerFn } from '@tanstack/react-start'
export const paren = (createServerFn({ method: 'GET' }).handler)(() => 'MARK_PAREN')
`,
  nonNull: `import { createServerFn } from '@tanstack/react-start'
export const nonNull = createServerFn({ method: 'GET' }).handler!(() => 'MARK_NONNULL')
`,
}

const files = {
  // Type-only uses of a value import keep the import (the `boot` case)
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      verbatimModuleSyntax: true,
    },
  }),
  'src/reach/builder.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn({ method: 'GET' })
`,
  ...Object.fromEntries(
    Object.entries(shapes).map(([name, code]) => [
      `src/reach/${name}.ts`,
      code,
    ]),
  ),
  'src/reach/Calls.tsx': `'use client'
import { useState } from 'react'
${Object.keys(shapes)
  .map((name) => `import { ${name} } from './${name}'`)
  .join('\n')}
function Call({ name, fn }: { name: string; fn: () => Promise<string> }) {
  const [result, setResult] = useState('')
  return (
    <button data-testid={name} onClick={() => fn().then(setResult, (error) => setResult('error ' + error))}>
      {name} {result}
    </button>
  )
}
export function Calls() {
  return (
    <>
      ${Object.keys(shapes)
        .map((name) => `<Call name="${name}" fn={${name}} />`)
        .join('\n      ')}
    </>
  )
}
`,
  // A module a client component imports a binding of only for a type: its
  // load installs a caller of a server fn.
  'src/reach/booted.ts': `import { createServerFn } from '@tanstack/react-start'
export const booted = createServerFn({ method: 'GET' }).handler(() => 'MARK_BOOTED')
`,
  'src/reach/boot.ts': `import { booted } from './booted'
export function boot() { return 1 }
if (typeof window !== 'undefined') { Object.assign(window, { callBooted: () => booted() }) }
`,
  'src/reach/Booted.tsx': `'use client'
import { boot } from './boot'
export type Boot = typeof boot
export function Booted() {
  return <span data-testid="booted">booted</span>
}
`,
  'src/reach/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Booted } from './Booted'
import { Calls } from './Calls'
export const getPage = createServerFn().handler(() => renderServerComponent(<div>server <Calls /><Booted /></div>))
`,
  'src/routes/reach.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getPage } from '../reach/page'
export const Route = createFileRoute('/reach')({
  loader: async () => ({ tree: await getPage() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
  // A client entry that imports a debug server fn in development only; its
  // module imports a package with a `development` export only.
  'node_modules/dev-only-adapter/package.json': JSON.stringify({
    name: 'dev-only-adapter',
    type: 'module',
    exports: {
      '.': { types: './index.d.ts', development: './index.js' },
    },
  }),
  'node_modules/dev-only-adapter/index.js': `export const label = 'MARK_DEV_ADAPTER'\n`,
  'node_modules/dev-only-adapter/index.d.ts': `export declare const label: string\n`,
  'src/debug.ts': `import { createServerFn } from '@tanstack/react-start'
import { label } from 'dev-only-adapter'
export const debugPing = createServerFn().handler(() => label)
`,
  'src/client.tsx': `import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
if (process.env.NODE_ENV === 'development') {
  void import('./debug').then(({ debugPing }) => Object.assign(window, { debugPing }))
}
hydrateRoot(document, <StartClient />)
`,
  // A `'use client'` component a server component renders, importing a
  // debug server fn in development only (the same dependency).
  'src/guarded/debug.ts': `import { createServerFn } from '@tanstack/react-start'
import { label } from 'dev-only-adapter'
export const guardedDebug = createServerFn().handler(() => label)
`,
  'src/guarded/ping.ts': `import { createServerFn } from '@tanstack/react-start'
export const ping = createServerFn({ method: 'GET' }).handler(() => 'MARK_PING')
`,
  'src/guarded/Ping.tsx': `'use client'
import { useState } from 'react'
import { ping } from './ping'
if (process.env.NODE_ENV === 'development') {
  void import('./debug').then(({ guardedDebug }) => Object.assign(window, { guardedDebug }))
}
export function Ping() {
  const [result, setResult] = useState('')
  return <button data-testid="ping" onClick={() => ping().then(setResult)}>ping {result}</button>
}
`,
  'src/guarded/card.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Ping } from './Ping'
export const getCard = createServerFn().handler(() => renderServerComponent(<div>card <Ping /></div>))
`,
  'src/routes/guarded.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getCard } from '../guarded/card'
export const Route = createFileRoute('/guarded')({
  loader: async () => ({ tree: await getCard() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
  'src/greet.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_GREET')
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { greet } from '../greet'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [called, setCalled] = useState('')
  return <button data-testid="greet" onClick={() => greet().then(setCalled)}>called {called}</button>
}
`,
}

describe("Vite production build with RSC: server fns only 'use client' components import", () => {
  let server: RscPreviewServer
  const cleanups: Array<() => Promise<void>> = []

  // The build fails when the early compile follows the development-only
  // import into its provider's dependency, which has no production entry.
  beforeAll(async () => {
    server = await startRscPreviewServer({
      files,
      config: { build: { minify: false } },
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  const open = async (pathname: string): Promise<BrowserPage> => {
    const page = await openRscPage(server, pathname, {
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
    })
    await waitForHydration(page)
    return page
  }

  // SPEC J4.2: a server fn the client calls is callable by id, whichever
  // spelling of its chain the planner accepts.
  test.each(Object.keys(shapes))(
    'a server fn written as the %s spelling runs when clicked',
    async (name) => {
      const page = await open('/reach')
      const button = `[data-testid=${name}]`
      await page.page.locator(button).click()
      expect(
        await settledValue(
          page,
          () => page.text(button),
          (text) => text.includes('MARK_'),
        ),
      ).toBe(`${name} MARK_${name.toUpperCase()}`)
    },
  )

  // SPEC J4.2, J4.17: under `verbatimModuleSyntax` the import of a binding a
  // client component uses only in a type stays, so the module runs in the
  // browser, and the server fn its load reaches answers.
  test('a server fn a client component reaches through a type-only use of an import answers', async () => {
    const page = await open('/reach')
    await page.page.locator('[data-testid=booted]').waitFor()
    expect(await page.page.evaluate(() => (window as any).callBooted())).toBe(
      'MARK_BOOTED',
    )
  })

  // SPEC J4.2, G1: a server fn only a development branch of the client
  // entry imports is no part of the production build: it builds, and the
  // app's server fns answer.
  test('a server fn only development code imports adds no production dependency', async () => {
    const page = await open('/')
    await page.page.locator('[data-testid=greet]').click()
    await page.waitForText('called MARK_GREET', {
      selector: '[data-testid=greet]',
    })
    expect(page.errors).toEqual([])
  })

  // SPEC J4.2, G1: the same when the development branch is in a `'use
  // client'` component a server component renders: it builds, and the
  // component's server fn answers.
  test("a server fn only development code of a 'use client' component imports adds no production dependency", async () => {
    const page = await open('/guarded')
    const button = '[data-testid=ping]'
    const response = page.page.waitForResponse((r) =>
      r.url().includes('/_serverFn/'),
    )
    await page.page.locator(button).click()
    expect((await response).status()).toBe(200)
    await page.waitForText('ping MARK_PING', { selector: button })
    expect(page.errors).toEqual([])
  })
})
