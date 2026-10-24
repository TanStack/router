/**
 * A production build of a React Start app with RSC enabled on Vite
 * (`rsc-app.ts`: `buildApp()` of the `client`, `ssr` and `rsc`
 * environments, served by Start's preview server) in a real page: which
 * entry of a dependency each environment runs (SPEC J4.3, J4.16, J4.12),
 * env-only fns a server fn handler calls (J4.10), and the CSS of server
 * components rendered with each RSC
 * helper (SPEC J7.2, J7.3). The dev counterparts are rsc-start-dev.test.ts
 * and rsc-css-matrix.test.ts.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  computedStyle,
  openRscPage,
  settledValue,
  startRscPreviewServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RscPreviewServer } from './rsc-app'

/** A dependency whose entry differs by export condition. */
const envMarkerPackage = {
  'node_modules/env-marker/package.json': JSON.stringify({
    name: 'env-marker',
    type: 'module',
    exports: {
      '.': {
        'react-server': './react-server.js',
        browser: './browser.js',
        default: './default.js',
      },
    },
  }),
  // Counts its initialisations in the server process.
  'node_modules/env-marker/react-server.js': `globalThis.__envMarkerInits = (globalThis.__envMarkerInits ?? 0) + 1
export const where = () => 'MARK_REACT_SERVER:' + globalThis.__envMarkerInits
`,
  'node_modules/env-marker/browser.js': `export const where = () => 'MARK_BROWSER'\n`,
  'node_modules/env-marker/default.js': `export const where = () => 'MARK_DEFAULT'\n`,
}

/** A module whose server fn renders a local `Card` with `api`. */
const cssRow = (key: string, imports: string, body: string) => ({
  [`src/rows/${key}.tsx`]: `import { createServerFn } from '@tanstack/react-start'
${imports}
import styles from './${key}.module.css'
function Card({ children }: { children?: React.ReactNode }) {
  return <div className={styles.card} data-testid="card">MARK_CARD{children}</div>
}
export const render = createServerFn().handler(async () => {
  ${body}
})
`,
  // The row in the content: scoped class names hash the content
  [`src/rows/${key}.module.css`]: `/* ${key} */\n.card { background: #fef3c7; }\n`,
})

const CARD_BACKGROUND = 'rgb(254, 243, 199)'

const files = {
  ...envMarkerPackage,
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { where } from 'env-marker'
export const greet = createServerFn().handler(() => where())
`,
  'src/routes/env.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { where } from 'env-marker'
import { greet } from '../fns'
export const Route = createFileRoute('/env')({
  loader: async () => ({ own: where(), provider: await greet() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [browser, setBrowser] = useState('')
  return (
    <main>
      <p data-testid="label">ssr {data.own} provider {data.provider}</p>
      <p data-testid="called">called {called}</p>
      <p data-testid="browser">browser {browser}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="where" onClick={() => setBrowser(where())}>where</button>
    </main>
  )
}
`,
  ...cssRow(
    'renderable',
    `import { renderServerComponent } from '@tanstack/react-start/rsc'`,
    `return renderServerComponent(<Card />)`,
  ),
  ...cssRow(
    'composite',
    `import { createCompositeComponent } from '@tanstack/react-start/rsc'`,
    `return createCompositeComponent((props) => <Card>{props.children}</Card>)`,
  ),
  ...cssRow(
    'flight',
    `import { renderToReadableStream } from '@tanstack/react-start/rsc'`,
    `return new Response(renderToReadableStream(<Card />), {
    headers: { 'Content-Type': 'text/x-component' },
  })`,
  ),
  ...cssRow(
    'identifier',
    `import { renderToReadableStream } from '@tanstack/react-start/rsc'`,
    `const node = <Card />
  return new Response(renderToReadableStream(node), { headers: { 'Content-Type': 'text/x-component' } })`,
  ),
  ...cssRow(
    'spread',
    `import { renderToReadableStream } from '@tanstack/react-start/rsc'`,
    `const args = [<Card />] as const
  return new Response(renderToReadableStream(...args), { headers: { 'Content-Type': 'text/x-component' } })`,
  ),
  // A server fn whose only importer is a `'use client'` component that a
  // server component renders.
  'src/client-ref/update.ts': `import { createServerFn } from '@tanstack/react-start'
export const update = createServerFn({ method: 'POST' }).handler(() => 'MARK_UPDATED')
`,
  'src/client-ref/Counter.tsx': `'use client'
import { useState } from 'react'
import { update } from './update'
export function Counter() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="counter" onClick={() => update().then(setResult, (error) => setResult('error ' + error))}>
      counter {result}
    </button>
  )
}
`,
  'src/client-ref/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Counter } from './Counter'
export const getPage = createServerFn().handler(() => renderServerComponent(<div>server <Counter /></div>))
`,
  'src/routes/client-ref.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getPage } from '../client-ref/page'
export const Route = createFileRoute('/client-ref')({
  loader: async () => ({ tree: await getPage() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <main>{data.tree}</main>
}
`,
  // A server fn module whose source names only createServerFn: its handler
  // calls env-only fns that a project module re-exports under other names.
  'src/aliased/env.ts': `export { createServerOnlyFn as makeServerOnly, createClientOnlyFn as makeClientOnly } from '@tanstack/react-start'
`,
  'src/aliased/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { makeClientOnly, makeServerOnly } from './env'
const readSecret = makeServerOnly(() => 'MARK_ALIASED_SERVER_ONLY')
const readBrowser = makeClientOnly(() => 'MARK_ALIASED_CLIENT_ONLY')
export const readAliased = createServerFn().handler(() => {
  let clientOnly = 'threw'
  try {
    clientOnly = readBrowser()
  } catch {}
  return 'server-only ' + readSecret() + ' client-only ' + clientOnly
})
`,
  'src/routes/aliased.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { readAliased } from '../aliased/fns'
export const Route = createFileRoute('/aliased')({
  loader: () => readAliased(),
  component: Page,
})
function Page() {
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="loaded">loaded {Route.useLoaderData()}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => readAliased().then(setCalled)}>call</button>
    </main>
  )
}
`,
  'src/routes/control.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { render as renderable } from '../rows/renderable'
import { render as composite } from '../rows/composite'
import { render as flight } from '../rows/flight'
export const Route = createFileRoute('/control')({ component: Control })
function Control() {
  return <main data-testid="control">{[renderable, composite, flight].map((render, index) => <a key={index} href={render.url}>caller</a>)}</main>
}
`,
  'src/routes/css.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { CompositeComponent, createFromFetch } from '@tanstack/react-start/rsc'
import { useEffect, useState } from 'react'
import { render as renderable } from '../rows/renderable'
import { render as composite } from '../rows/composite'
import { render as flight } from '../rows/flight'
import { render as identifier } from '../rows/identifier'
import { render as spread } from '../rows/spread'
export const Route = createFileRoute('/css')({
  loader: async () => ({ renderable: await renderable(), composite: await composite() }),
  component: Page,
})
function Flight({ render = flight }: { render?: typeof flight }) {
  const [tree, setTree] = useState<unknown>(null)
  useEffect(() => {
    createFromFetch(render()).then(setTree)
  }, [])
  return <>{tree as React.ReactNode}</>
}
function Page() {
  const data = Route.useLoaderData()
  return (
    <main>
      <section data-row="renderable">{data.renderable}</section>
      <section data-row="composite">
        <CompositeComponent src={data.composite}>
          <em>MARK_SLOT</em>
        </CompositeComponent>
      </section>
      <section data-row="flight"><Flight /></section>
      <section data-row="identifier"><Flight render={identifier} /></section>
      <section data-row="spread"><Flight render={spread} /></section>
    </main>
  )
}
`,
}

/** The files of `dir`, recursively. */
async function filesOf(dir: string): Promise<Array<string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

describe('Vite production build with RSC', () => {
  let server: RscPreviewServer
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    server = await startRscPreviewServer({
      files,
      config: {
        // Bundled into the provider like Start's own packages are: the
        // `rsc` build otherwise leaves a dependency external, and Node
        // imports it at run time with its own conditions, not
        // `react-server` (@vitejs/plugin-rsc, upstream).
        environments: { rsc: { resolve: { noExternal: ['env-marker'] } } },
        // Output size is not under test
        build: { minify: false },
      },
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
    return page
  }

  // J4.3, J4.16, J4.12: the provider runs the handler with `react-server`
  // and initialises the package once, whether SSR or the browser calls it;
  // SSR's own code gets `default`, the browser `browser`; no client file of
  // the build has another environment's entry.
  test('each environment runs its own entry of a dependency; the provider runs the handler', async () => {
    const page = await open('/env')
    await page.waitForText('ssr MARK_DEFAULT provider MARK_REACT_SERVER:1', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(page)
    await page.page.locator('[data-testid=call]').click()
    await page.waitForText('called MARK_REACT_SERVER:1', {
      selector: '[data-testid=called]',
    })
    await page.page.locator('[data-testid=where]').click()
    await page.waitForText('browser MARK_BROWSER', {
      selector: '[data-testid=browser]',
    })
    const client = await Promise.all(
      (await filesOf(path.join(server.root, 'dist/client'))).map((file) =>
        readFile(file, 'utf8'),
      ),
    )
    expect({
      browser: client.some((code) => code.includes('MARK_BROWSER')),
      server: client.some((code) =>
        /MARK_REACT_SERVER|MARK_DEFAULT/.test(code),
      ),
    }).toEqual({ browser: true, server: false })
    expect(page.errors).toEqual([])
  })

  // SPEC J4.10, J4.12, G11 (the Start compiler composed with the RSC CSS
  // transform): in the provider, the handler's env-only fns, reached
  // through renamed re-exports of a module whose source names only
  // createServerFn, are compiled: the server-only one runs, the client-only
  // one throws, whether SSR or the browser calls the server fn; the
  // server-only body is not in any client file.
  test('a server fn handler compiles env-only fns of renamed re-exports in the provider', async () => {
    const expected = 'server-only MARK_ALIASED_SERVER_ONLY client-only threw'
    const page = await open('/aliased')
    await page.waitForText(`loaded ${expected}`, {
      selector: '[data-testid=loaded]',
    })
    await waitForHydration(page)
    await page.page.locator('[data-testid=call]').click()
    await page.waitForText(`called ${expected}`, {
      selector: '[data-testid=called]',
    })
    const client = await Promise.all(
      (await filesOf(path.join(server.root, 'dist/client'))).map((file) =>
        readFile(file, 'utf8'),
      ),
    )
    expect(
      client.some((code) => code.includes('MARK_ALIASED_SERVER_ONLY')),
    ).toBe(false)
    expect(page.errors).toEqual([])
  })

  // SPEC J4.2: a server fn the client references is registered and runs
  // when called by id, also when its only importer is a `'use client'`
  // component that reaches the browser through a server component.
  // Bug: the server-fn manifest of the build has no entry for it (the
  // provider build never processes a module only a client reference
  // imports), so the call answers 500 ("Server function info not found").
  // Impact: a server fn imported only by a client component of a server
  // component cannot be called in production (#7943).
  test.fails(
    "a server fn only a 'use client' component of a server component imports runs when clicked",
    async () => {
      const page = await open('/client-ref')
      await page.page.locator('[data-testid=counter]').waitFor()
      await waitForHydration(page)
      await page.page.locator('[data-testid=counter]').click()
      expect(
        await settledValue(
          page,
          () => page.text('[data-testid=counter]'),
          (text) => text.includes('MARK_UPDATED'),
        ),
      ).toBe('counter MARK_UPDATED')
    },
  )

  test('loading the client callers without an RSC result supplies no server CSS', async () => {
    const page = await open('/control')
    await page.waitForText('caller', { selector: '[data-testid=control]' })
    await waitForHydration(page)
    const css = await page.page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText)
          } catch {
            return []
          }
        })
        .join('\n'),
    )
    expect(css).not.toMatch(/254, 243, 199|#fef3c7/i)
    expect(page.errors).toEqual([])
  })

  test.each(['identifier', 'spread'])(
    'production %s stream still renders without development warnings',
    async (row) => {
      const page = await open('/css')
      await page.waitForText('MARK_CARD', {
        selector: `section[data-row=${row}]`,
      })
      await waitForHydration(page)
      expect(
        [...server.messages, ...page.console].filter((message) =>
          /renderToReadableStream/.test(message),
        ),
      ).toEqual([])
      expect(page.errors).toEqual([])
    },
  )

  test.each(['renderable', 'composite', 'flight'])(
    'the %s row styles its server component',
    async (row) => {
      const page = await open('/css')
      const selector = `section[data-row=${row}] [data-testid=card]`
      await page.page.locator(selector).waitFor()
      await waitForHydration(page)
      expect(
        await settledValue(
          page,
          () => computedStyle(page, selector, 'background-color'),
          (value) => value === CARD_BACKGROUND,
        ),
      ).toBe(CARD_BACKGROUND)
      expect(page.errors).toEqual([])
    },
  )
})
