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
 * Also in this build: the ways out the build error for a server fn the
 * provider does not list gives (rsc-start-build-not-provided.test.ts),
 * applied, for a file of the app and for one of an installed package.
 */
import { describe, expect } from 'vitest'
import { installedServerFnFiles } from './client-only-reach-app'
import {
  answeredText,
  startRscPreviewServer,
  waitForHydration,
} from './rsc-app'
import { test } from './test'
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
  'src/guarded/card.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { NotedPing } from './NotedPing'
import { Ping } from './Ping'
export const getCard = createServerFn().handler(() => renderServerComponent(<div>card <Ping /><NotedPing /></div>))
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
  // The build error's way out for a file of the app: a server fn only a
  // \`<ClientOnly>\` child imports, which a server fn's handler also uses.
  'src/way-out/onlyClient.ts': `import { createServerFn } from '@tanstack/react-start'
export const onlyClient = createServerFn({ method: 'GET' }).handler(() => 'MARK_ONLYCLIENT')
`,
  'src/way-out/uses.ts': `import { createServerFn } from '@tanstack/react-start'
import { onlyClient } from './onlyClient'
export const usesOnlyClient = createServerFn().handler(async () => 'USES ' + (await onlyClient()))
`,
  'src/routes/way-out-app.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { onlyClient } from '../way-out/onlyClient'
import { usesOnlyClient } from '../way-out/uses'
export const Route = createFileRoute('/way-out-app')({
  loader: () => usesOnlyClient(),
  component: Page,
})
function Page() {
  const [result, setResult] = useState('')
  return (
    <main>
      <p data-testid="uses">{Route.useLoaderData()}</p>
      <ClientOnly fallback={<span>loading</span>}>
        <button data-testid="onlyClient" onClick={() => onlyClient().then(setResult, (error) => setResult('error ' + error))}>
          onlyClient {result}
        </button>
      </ClientOnly>
    </main>
  )
}
`,
  // The way out for a file of an installed package: its server fn, which a
  // \`'use client'\` component and a server fn's handler call, called from a
  // route's loader as well (no longer needed for a package that declares
  // Start: the reach walk enters it, see /declared-package).
  ...installedServerFnFiles,
  'src/way-out/PkgCall.tsx': `'use client'
import { useState } from 'react'
import { pkgPing } from 'pkg-fns'
export function PkgCall() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="pkgPing" onClick={() => pkgPing().then(setResult, (error) => setResult('error ' + error))}>
      pkgPing {result}
    </button>
  )
}
`,
  'src/way-out/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { PkgCall } from './PkgCall'
export const getPkgPage = createServerFn().handler(() => renderServerComponent(<div>pkg <PkgCall /></div>))
`,
  'src/way-out/usesPkg.ts': `import { createServerFn } from '@tanstack/react-start'
import { pkgPing } from 'pkg-fns'
export const usesPkg = createServerFn().handler(async () => 'USES ' + (await pkgPing()))
`,
  'src/routes/way-out-package.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { pkgPing } from 'pkg-fns'
import { getPkgPage } from '../way-out/page'
import { usesPkg } from '../way-out/usesPkg'
export const Route = createFileRoute('/way-out-package')({
  loader: async () => ({ tree: await getPkgPage(), ping: (await pkgPing()) + ' ' + (await usesPkg()) }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <main><p data-testid="loaderPing">{data.ping}</p>{data.tree}</main>
}
`,
  // An installed package that declares Start: its server fn, which a
  // \`'use client'\` component and a server fn's handler call, with no
  // loader of a route calling it (node_modules policy, decision 2).
  'package.json': JSON.stringify({
    name: 'app',
    private: true,
    type: 'module',
    dependencies: { 'pkg-fns': '1.0.0', 'pkg-declared': '1.0.0' },
  }),
  'node_modules/pkg-declared/package.json': JSON.stringify({
    name: 'pkg-declared',
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.js' },
    peerDependencies: { '@tanstack/react-start': '*' },
  }),
  'node_modules/pkg-declared/index.js': `import { createServerFn } from '@tanstack/react-start'
export const declPing = createServerFn({ method: 'GET' }).handler(() => 'MARK_DECLPING')
`,
  'src/declared/DeclCall.tsx': `'use client'
import { useState } from 'react'
import { declPing } from 'pkg-declared'
export function DeclCall() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="declPing" onClick={() => declPing().then(setResult, (error) => setResult('error ' + error))}>
      declPing {result}
    </button>
  )
}
`,
  'src/declared/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { DeclCall } from './DeclCall'
export const getDeclPage = createServerFn().handler(() => renderServerComponent(<div>decl <DeclCall /></div>))
`,
  'src/declared/usesDecl.ts': `import { createServerFn } from '@tanstack/react-start'
import { declPing } from 'pkg-declared'
export const usesDecl = createServerFn().handler(async () => 'USES ' + (await declPing()))
`,
  'src/routes/declared-package.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getDeclPage } from '../declared/page'
import { usesDecl } from '../declared/usesDecl'
export const Route = createFileRoute('/declared-package')({
  loader: async () => ({ tree: await getDeclPage(), uses: await usesDecl() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <main><p data-testid="declUses">{data.uses}</p>{data.tree}</main>
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

  // The build fails when the early compile follows the development-only
  // import into its provider's dependency, which has no production entry.
  test.aroundAll(async (runSuite, { fileRoot }) => {
    server = await startRscPreviewServer(fileRoot, {
      files,
      config: { build: { minify: false } },
    })
    try {
      await runSuite()
    } finally {
      await server.close()
    }
  })

  // SPEC J4.2: a server fn the client calls is callable by id, whichever
  // spelling of its chain the planner accepts.
  test.for(Object.keys(shapes))(
    'a server fn written as the %s spelling runs when clicked',
    async (name, { openRscPage }) => {
      const page = await openRscPage(server, '/reach')
      await waitForHydration(page)
      const button = `[data-testid=${name}]`
      await page.locator(button).click()
      expect(
        await answeredText(page, button, (text) => text.includes('MARK_')),
      ).toBe(`${name} MARK_${name.toUpperCase()}`)
    },
  )

  // SPEC J4.2, J4.17: under `verbatimModuleSyntax` the import of a binding a
  // client component uses only in a type stays, so the module runs in the
  // browser, and the server fn its load reaches answers.
  test('a server fn a client component reaches through a type-only use of an import answers', async ({
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/reach')
    await waitForHydration(page)
    await page.locator('[data-testid=booted]').waitFor()
    expect(await page.evaluate(() => (window as any).callBooted())).toBe(
      'MARK_BOOTED',
    )
  })

  // SPEC J4.2, G1: a server fn only a development branch of the client
  // entry imports is no part of the production build: it builds, and the
  // app's server fns answer.
  test('a server fn only development code imports adds no production dependency', async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/')
    await waitForHydration(page)
    await page.locator('[data-testid=greet]').click()
    await page
      .locator('[data-testid=greet]', { hasText: 'called MARK_GREET' })
      .waitFor()
    expect(pageErrors).toEqual([])
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
    async ({ name }, { pageErrors, openRscPage }) => {
      const page = await openRscPage(server, '/guarded')
      await waitForHydration(page)
      const button = `[data-testid=${name}]`
      const response = page.waitForResponse((r) =>
        r.url().includes('/_serverFn/'),
      )
      await page.locator(button).click()
      expect((await response).status()).toBe(200)
      await page.locator(button, { hasText: `${name} MARK_PING` }).waitFor()
      expect(pageErrors).toEqual([])
    },
  )

  // SPEC J4.2: a server fn a `'use client'` component calls, in a server
  // component a server fn's handler imports lazily, is callable by id; a
  // comment in the handler's module that quotes the directive does not
  // make it a client boundary.
  test("a server fn below a server handler's lazy import runs when clicked", async ({
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/split')
    await waitForHydration(page)
    const button = '[data-testid=inner]'
    await page.locator(button).click()
    expect(
      await answeredText(
        page,
        button,
        (text) => text.includes('MARK_') || text.includes('error'),
      ),
    ).toBe('inner MARK_INNER')
  })

  // The build error's ways out (rsc-start-build-not-provided.test.ts),
  // applied: the build succeeds, and the browser's call of the server fn
  // answers, as does the server's (the loader's, and a server fn handler's
  // call of the installed package's function, which answered "Server
  // function info not found" without the loader's: KNOWN-BUGS).
  test.for([
    {
      kind: 'a file of the app',
      pathname: '/way-out-app',
      name: 'onlyClient',
      server: { selector: '[data-testid=uses]', text: 'USES MARK_ONLYCLIENT' },
    },
    {
      kind: 'a file of an installed package',
      pathname: '/way-out-package',
      name: 'pkgPing',
      server: {
        selector: '[data-testid=loaderPing]',
        text: 'MARK_PKGPING USES MARK_PKGPING',
      },
    },
    // (no way out needed: the reach walk enters a package that declares
    // Start; it was the known bug of the installed package)
    {
      kind: 'a file of an installed package that declares Start, with no loader calling it',
      pathname: '/declared-package',
      name: 'declPing',
      server: {
        selector: '[data-testid=declUses]',
        text: 'USES MARK_DECLPING',
      },
    },
  ])(
    "the build error's way out for $kind makes its server fn answer",
    async ({ pathname, name, server: answered }, { openRscPage }) => {
      const page = await openRscPage(server, pathname)
      await waitForHydration(page)
      await page
        .locator(answered.selector, { hasText: answered.text })
        .waitFor()
      const button = `[data-testid=${name}]`
      const response = page.waitForResponse((r) =>
        r.url().includes('/_serverFn/'),
      )
      await page.locator(button).click()
      expect((await response).status()).toBe(200)
      expect(
        await answeredText(
          page,
          button,
          (text) => text.includes('MARK_') || text.includes('error'),
        ),
      ).toBe(`${name} MARK_${name.toUpperCase()}`)
    },
  )
})
