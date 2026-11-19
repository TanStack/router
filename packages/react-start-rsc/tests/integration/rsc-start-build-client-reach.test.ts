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
 * production dependency (also under a comment in the client component's
 * directive prologue). A server handler's lazy import is followed, also
 * when a comment of its module quotes the directive. The first case of
 * each kind is in rsc-start-build.test.ts ("a server fn only a 'use client' component …").
 * Pinned in the same build: server fns only client-only code imports
 * (`client-only-reach-app.ts`).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  clientOnlyPositions,
  clientOnlyReachFiles,
  expectClientOnlyCallAnswers,
} from './client-only-reach-app'
import {
  answeredText,
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
  ...clientOnlyReachFiles,
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
  // The same with a comment in the component's directive prologue.
  'src/guarded/NotedPing.tsx': `"use strict" /* generated module */;
'use client'
import { useState } from 'react'
import { ping } from './ping'
if (process.env.NODE_ENV === 'development') {
  void import('./debug').then(({ guardedDebug }) => Object.assign(window, { guardedDebug }))
}
export function NotedPing() {
  const [result, setResult] = useState('')
  return <button data-testid="noted" onClick={() => ping().then(setResult)}>noted {result}</button>
}
`,
  // A `'use client'` component that imports a server fn's module lazily.
  'src/guarded/lazy.ts': `import { createServerFn } from '@tanstack/react-start'
export const lazyPing = createServerFn({ method: 'GET' }).handler(() => 'MARK_LAZY')
`,
  'src/guarded/LazyPing.tsx': `'use client'
import { useState } from 'react'
export function LazyPing() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="lazy" onClick={() => import('./lazy').then((m) => m.lazyPing()).then(setResult, (error) => setResult('error ' + error))}>
      lazy {result}
    </button>
  )
}
`,
  'src/guarded/card.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { LazyPing } from './LazyPing'
import { NotedPing } from './NotedPing'
import { Ping } from './Ping'
export const getCard = createServerFn().handler(() => renderServerComponent(<div>card <Ping /><NotedPing /><LazyPing /></div>))
`,
  // A server fn whose handler imports a server component lazily, which
  // renders a `'use client'` component calling another server fn; a comment
  // in the server module quotes the directive.
  'src/split/inner-fn.ts': `import { createServerFn } from '@tanstack/react-start'
export const innerFn = createServerFn({ method: 'GET' }).handler(() => 'MARK_INNER')
`,
  'src/split/InnerCall.tsx': `'use client'
import { useState } from 'react'
import { innerFn } from './inner-fn'
export function InnerCall() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="inner" onClick={() => innerFn().then(setResult, (error) => setResult('error ' + error))}>
      inner {result}
    </button>
  )
}
`,
  'src/split/inner.tsx': `import { InnerCall } from './InnerCall'
export function Inner() {
  return <div><InnerCall /></div>
}
`,
  'src/split/content.tsx': `// This server module renders a 'use client' component.
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const getSplit = createServerFn().handler(async () => {
  const { Inner } = await import('./inner')
  return renderServerComponent(<div>split <Inner /></div>)
})
`,
  'src/routes/split.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getSplit } from '../split/content'
export const Route = createFileRoute('/split')({
  loader: async () => ({ tree: await getSplit() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
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

  // (a page closes when its test ends: a test process keeps at most 16
  // pages open, `openPageLimit` of the browser harness)
  const open = async (pathname: string): Promise<BrowserPage> => {
    const page = await openRscPage(server, pathname)
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
  // client'` component a server component renders, also one whose directive
  // prologue holds a comment: it builds, and the component's server fn
  // answers.
  test.for([
    { name: 'ping', prologue: 'directive' },
    { name: 'noted', prologue: 'commented directive' },
  ])(
    "a server fn only development code of a 'use client' component ($prologue prologue) imports adds no production dependency",
    async ({ name }) => {
      const page = await open('/guarded')
      const button = `[data-testid=${name}]`
      const response = page.page.waitForResponse((r) =>
        r.url().includes('/_serverFn/'),
      )
      await page.page.locator(button).click()
      expect((await response).status()).toBe(200)
      await page.waitForText(`${name} MARK_PING`, { selector: button })
      expect(page.errors).toEqual([])
    },
  )

  // SPEC J4.2: a server fn a `'use client'` component calls, in a server
  // component a server fn's handler imports lazily, is callable by id; a
  // comment in the handler's module that quotes the directive does not
  // make it a client boundary.
  test("a server fn below a server handler's lazy import runs when clicked", async () => {
    const page = await open('/split')
    const button = '[data-testid=inner]'
    await page.page.locator(button).click()
    expect(
      await settledValue(
        page,
        () => page.text(button),
        (text) => text.includes('MARK_') || text.includes('error'),
      ),
    ).toBe('inner MARK_INNER')
  })

  // Known bug (KNOWN-BUGS, "Vite RSC build: a server fn a `'use client'`
  // component imports lazily is not registered"; as `main`, #7943). SPEC
  // J4.2: a server fn the client calls is callable by id. Bug: the early
  // compile follows no lazy import at or below a `'use client'` module (so a
  // development-only one adds no production dependency), and nothing else
  // compiles the lazily imported module in the provider before its manifest
  // is written. Impact: the click answers "Server function info not found".
  // Fix: every server fn the client references is callable by id, with no
  // production dependency on modules only development code reaches.
  test.fails(
    "a server fn a 'use client' component imports lazily runs when clicked",
    async () => {
      const page = await open('/guarded')
      const button = '[data-testid=lazy]'
      await page.page.locator(button).click()
      expect(
        await answeredText(
          page,
          button,
          (text) => text.includes('MARK_') || text.includes('error'),
        ),
      ).toBe('lazy MARK_LAZY')
    },
  )

  // Known bug (KNOWN-BUGS, "RSC builds: a server fn only client-only code
  // imports is not registered"; as `main`). SPEC J4.2: a server fn the
  // client calls is callable by id. Bug: the SSR scan erases client-only
  // code (`<ClientOnly>` children, `createClientOnlyFn` bodies, `<Hydrate>`
  // fallbacks) and the imports only it reads, and the early compile of the
  // provider's reach starts only from server fn modules, which none of these
  // route or component files is, so the provider's manifest is written
  // without these server fns. Impact: the click answers "Server function
  // info not found". Fix: every server fn the client references is callable
  // by id, with no production dependency on modules only development code
  // reaches.
  test.fails.for(clientOnlyPositions)(
    'a server fn only $position of a $where imports runs when clicked',
    async ({ name }) => {
      await expectClientOnlyCallAnswers(server, name)
    },
  )
})
