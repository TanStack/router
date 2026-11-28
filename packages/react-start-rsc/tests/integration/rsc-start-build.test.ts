/**
 * A production build of a React Start app with RSC enabled on Vite
 * (`rsc-app.ts`: `buildApp()` of the `client`, `ssr` and `rsc`
 * environments, served by Start's preview server) in a real page: which
 * entry of a dependency each environment runs (SPEC J4.3, J4.16, J4.12),
 * env-only fns a server fn handler calls (J4.10), and the CSS of server
 * components rendered with each RSC helper, in a server fn's module or in a
 * helper module it calls (SPEC J7.2, J7.3). The dev counterparts are
 * rsc-start-dev.test.ts and rsc-css-matrix.test.ts.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect } from 'vitest'
import {
  answeredText,
  computedStyle,
  settledValue,
  startRscPreviewServer,
  waitForHydration,
} from './rsc-app'
import { HELPER_CARD_BACKGROUND, helperRow } from './rsc-css-rsbuild-app'
import { test } from './test'
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
  // A server fn that calls a helper module rendering a server component
  // with its own CSS module (rsc-css-rsbuild-app.ts)
  ...helperRow.files,
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
  // A route module that defines a server fn next to client-only module
  // code (`createContext` is not in React's `react-server` build)
  'src/routes/context.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { createContext, useContext } from 'react'
const Theme = createContext('MARK_THEME')
const getData = createServerFn().handler(async () => 'MARK_DATA')
export const Route = createFileRoute('/context')({
  loader: () => getData(),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const theme = useContext(Theme)
  return <p data-testid="label">{theme} {data}</p>
}
`,
  // A route module whose server fn is hoisted (an object's entry, R162) and
  // only the split component calls.
  'src/routes/nested.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const fns = { make: createServerFn().handler(async () => 'MARK_NESTED_FN') }
export const Route = createFileRoute('/nested')({ component: Page })
function Page() {
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => fns.make().then(setCalled)}>MARK_NESTED_PAGE</button>
    </main>
  )
}
`,
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
  // Server fns whose handler is itself an env-only or isomorphic call
  'src/handler-fns/fns.ts': `import { createClientOnlyFn, createIsomorphicFn, createServerFn } from '@tanstack/react-start'
export const clientOnly = createServerFn().handler(createClientOnlyFn(() => 'MARK_CLIENT_ONLY_IMPL'))
export const isomorphic = createServerFn().handler(
  createIsomorphicFn().server(() => 'MARK_ISO_SERVER').client(() => 'MARK_ISO_CLIENT'),
)
`,
  'src/routes/handler-fns.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { clientOnly, isomorphic } from '../handler-fns/fns'
const outcome = () =>
  clientOnly().then(
    (value) => 'returned ' + value,
    () => 'threw',
  )
export const Route = createFileRoute('/handler-fns')({
  loader: async () => ({ isomorphic: await isomorphic(), clientOnly: await outcome() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="loaded">loaded {data.isomorphic} {data.clientOnly}</p>
      <p data-testid="called">called {called}</p>
      <button
        data-testid="call"
        onClick={() => Promise.all([isomorphic(), outcome()]).then((values) => setCalled(values.join(' ')))}
      >
        call
      </button>
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

/**
 * Server fns only server code calls (`internal` in another module and
 * `sameFile` in `greet`'s, both called by `greet`'s handler) next to one
 * the client references, and a page exposing their URLs and a caller that
 * sends the real request envelope to a URL.
 */
const privateFnFiles = {
  'src/private/internal.ts': `import { createServerFn } from '@tanstack/react-start'
export const internal = createServerFn().handler(() => 'MARK_INTERNAL')
`,
  'src/private/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { internal } from './internal'
const sameFile = createServerFn().handler(() => 'MARK_SAME_FILE')
export const greet = createServerFn().handler(async () => 'MARK_GREET:' + (await internal()) + ':' + (await sameFile()))
export const urls = createServerFn().handler(() => ({ internal: internal.url, sameFile: sameFile.url }))
`,
  'src/routes/private.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greet, urls } from '../private/fns'
export const Route = createFileRoute('/private')({
  loader: async () => ({ label: await greet(), urls: await urls() }),
  component: Page,
})
if (typeof window !== 'undefined') {
  // The public caller supplies the real request envelope; only its URL
  // changes (no id parsing: the server decides by the id in the URL).
  ;(window as any).callUrl = async (url: string) => {
    let outcome: { ok: boolean; value: string } | undefined
    let error: string | undefined
    try {
      const value: unknown = await greet({ fetch: async (_input, init) => {
        const response = await fetch(url, init)
        outcome = { ok: response.ok, value: await response.clone().text() }
        return response
      } } as any)
      if (value instanceof Error) { error = String(value) }
    } catch (thrown) {
      if (!outcome) { throw thrown }
      error = String(thrown)
    }
    return { ...outcome, error }
  }
}
function Page() {
  const data = Route.useLoaderData()
  return (
    <main>
      <p data-testid="label">label {data.label}</p>
      <p data-testid="urls">{JSON.stringify({ greet: greet.url, ...data.urls })}</p>
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

  test.beforeAll(async ({ fileRoot }) => {
    server = await startRscPreviewServer(fileRoot, {
      files: { ...files, ...privateFnFiles },
      config: {
        // Bundled into the provider like Start's own packages are: the
        // `rsc` build otherwise leaves a dependency external, and Node
        // imports it at run time with its own conditions, not
        // `react-server` (@vitejs/plugin-rsc, upstream).
        environments: { rsc: { resolve: { noExternal: ['env-marker'] } } },
        // Output size is not under test
        build: { minify: false },
      },
    })
    return () => server.close()
  })

  // J4.3, J4.16, J4.12: the provider runs the handler with `react-server`
  // and initialises the package once, whether SSR or the browser calls it;
  // SSR's own code gets `default`, the browser `browser`; no client file of
  // the build has another environment's entry.
  test('each environment runs its own entry of a dependency; the provider runs the handler', async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/env')
    await page
      .locator('[data-testid=label]', {
        hasText: 'ssr MARK_DEFAULT provider MARK_REACT_SERVER:1',
      })
      .waitFor()
    await waitForHydration(page)
    await page.locator('[data-testid=call]').click()
    await page
      .locator('[data-testid=called]', {
        hasText: 'called MARK_REACT_SERVER:1',
      })
      .waitFor()
    await page.locator('[data-testid=where]').click()
    await page
      .locator('[data-testid=browser]', { hasText: 'browser MARK_BROWSER' })
      .waitFor()
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
    expect(pageErrors).toEqual([])
  })

  // SPEC J4.1, J4.14: the provider runs what the server fn needs, not the
  // route module's client-only code beside it.
  // Source: the react-start/rsc e2e app (rsc-context, Vite).
  test("a server fn runs in the provider next to its route module's client-only code", async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/context')
    await page
      .locator('[data-testid=label]', { hasText: 'MARK_THEME MARK_DATA' })
      .waitFor()
    expect(pageErrors).toEqual([])
  })

  // SPEC J4.1, J4.12, J4.14: a server fn created inside a function only the
  // split component calls runs in the provider when the browser calls it;
  // the handler's body is in no client file. The rsc build holds the
  // provider outputs the resolver reaches, not the route module or its
  // split chunk (the chunk would import the provider module, see the
  // `start-env` planner's claim of the nested chain for the provider
  // output only): a route's component code
  // is in no file of the rsc environment.
  test('a hoisted server fn only the split component calls', async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/nested')
    await waitForHydration(page)
    await page.locator('[data-testid=call]').click()
    await page
      .locator('[data-testid=called]', { hasText: 'called MARK_NESTED_FN' })
      .waitFor()
    const read = async (dir: string) =>
      Promise.all(
        (await filesOf(path.join(server.root, dir))).map((file) =>
          readFile(file, 'utf8'),
        ),
      )
    const client = await read('dist/client')
    const rsc = await read('dist/server/rsc')
    expect({
      handlerInClient: client.some((code) => code.includes('MARK_NESTED_FN')),
      handlerInRsc: rsc.some((code) => code.includes('MARK_NESTED_FN')),
      pageInRsc: rsc.some((code) => code.includes('MARK_NESTED_PAGE')),
    }).toEqual({ handlerInClient: false, handlerInRsc: true, pageInRsc: false })
    expect(pageErrors).toEqual([])
  })

  // SPEC J4.10, J4.12, G11 (the Start compiler composed with the RSC CSS
  // transform): in the provider, the handler's env-only fns, reached
  // through renamed re-exports of a module whose source names only
  // createServerFn, are compiled: the server-only one runs, the client-only
  // one throws, whether SSR or the browser calls the server fn; the
  // server-only body is not in any client file.
  test('a server fn handler compiles env-only fns of renamed re-exports in the provider', async ({
    pageErrors,
    openRscPage,
  }) => {
    const expected = 'server-only MARK_ALIASED_SERVER_ONLY client-only threw'
    const page = await openRscPage(server, '/aliased')
    await page
      .locator('[data-testid=loaded]', { hasText: `loaded ${expected}` })
      .waitFor()
    await waitForHydration(page)
    await page.locator('[data-testid=call]').click()
    await page
      .locator('[data-testid=called]', { hasText: `called ${expected}` })
      .waitFor()
    const client = await Promise.all(
      (await filesOf(path.join(server.root, 'dist/client'))).map((file) =>
        readFile(file, 'utf8'),
      ),
    )
    expect(
      client.some((code) => code.includes('MARK_ALIASED_SERVER_ONLY')),
    ).toBe(false)
    expect(pageErrors).toEqual([])
  })

  // SPEC J4.9, J4.10: a handler that is itself a client-only fn throws in
  // the provider, and one that is an isomorphic fn runs its server
  // implementation, whether SSR or the browser calls it; the provider holds
  // neither client implementation.
  test('a server fn whose handler is an env-only or isomorphic call runs it compiled for the server', async ({
    pageErrors,
    openRscPage,
  }) => {
    const expected = 'MARK_ISO_SERVER threw'
    const page = await openRscPage(server, '/handler-fns')
    await page
      .locator('[data-testid=loaded]', { hasText: `loaded ${expected}` })
      .waitFor()
    await waitForHydration(page)
    await page.locator('[data-testid=call]').click()
    await page
      .locator('[data-testid=called]', { hasText: `called ${expected}` })
      .waitFor()
    const rsc = await Promise.all(
      (await filesOf(path.join(server.root, 'dist/server/rsc'))).map((file) =>
        readFile(file, 'utf8'),
      ),
    )
    expect({
      clientOnly: rsc.some((code) => code.includes('MARK_CLIENT_ONLY_IMPL')),
      isomorphicClient: rsc.some((code) => code.includes('MARK_ISO_CLIENT')),
    }).toEqual({ clientOnly: false, isomorphicClient: false })
    expect(pageErrors).toEqual([])
  })

  // SPEC J4.2: a server fn the client references is registered and runs
  // when called by id, also when its only importer is a `'use client'`
  // component that reaches the browser through a server component (the
  // provider builds before the client: it compiles the reach of its
  // handlers before its build, so its manifest lists the fn; #7943).
  test("a server fn only a 'use client' component of a server component imports runs when clicked", async ({
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/client-ref')
    await page.locator('[data-testid=counter]').waitFor()
    await waitForHydration(page)
    await page.locator('[data-testid=counter]').click()
    expect(
      await answeredText(page, '[data-testid=counter]', (text) =>
        text.includes('MARK_UPDATED'),
      ),
    ).toBe('counter MARK_UPDATED')
  })

  // SPEC J4.2: in a production build only server functions client code
  // calls are callable over HTTP (R182). `internal` and `sameFile` are called by `greet`'s
  // handler only (a server-origin call, which works); a request by its URL
  // from the browser is refused, while the same request to `greet` answers.
  // With a separate provider the provider builds before the client, so the
  // refusal is decided where the HTTP handler runs, after the client built.
  test('a server function only server code calls is not callable from the browser', async ({
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/private')
    await page
      .locator('[data-testid=label]', {
        hasText: 'label MARK_GREET:MARK_INTERNAL',
      })
      .waitFor()
    await waitForHydration(page)
    const urls = JSON.parse(
      (await page.locator('[data-testid=urls]').textContent())!,
    ) as {
      greet: string
      internal: string
      sameFile: string
    }
    expect(typeof urls.internal).toBe('string')
    expect(typeof urls.sameFile).toBe('string')
    const call = (url: string) =>
      page.evaluate(
        (functionUrl) => (window as any).callUrl(functionUrl),
        url,
      ) as Promise<{ ok?: boolean; value?: string; error?: string }>
    // the same envelope reaches an exposed function, so a malformed request
    // cannot masquerade as a refusal of `internal`
    expect(await call(urls.greet)).toMatchObject({
      ok: true,
      value: expect.stringContaining('MARK_GREET:MARK_INTERNAL'),
    })
    const refused = await call(urls.internal)
    expect(refused.ok).toBe(false)
    expect(refused.value ?? '').not.toContain('MARK_INTERNAL')
    // R182: also a server fn of a module the client imports, which no
    // client code calls
    const refusedSameFile = await call(urls.sameFile)
    expect(refusedSameFile.ok).toBe(false)
    expect(refusedSameFile.value ?? '').not.toContain('MARK_SAME_FILE')
  })

  test('loading the client callers without an RSC result supplies no server CSS', async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, '/control')
    await page.locator('[data-testid=control]', { hasText: 'caller' }).waitFor()
    await waitForHydration(page)
    const css = await page.evaluate(() =>
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
    expect(pageErrors).toEqual([])
  })

  test.for(['identifier', 'spread'])(
    'production %s stream still renders without development warnings',
    async (row, { pageErrors, openRscPage }) => {
      const page = await openRscPage(server, '/css')
      await page
        .locator(`section[data-row=${row}]`, { hasText: 'MARK_CARD' })
        .waitFor()
      await waitForHydration(page)
      expect(
        [
          ...server.messages,
          ...(await page.consoleMessages()).map((message) => message.text()),
        ].filter((message) => /renderToReadableStream/.test(message)),
      ).toEqual([])
      expect(pageErrors).toEqual([])
    },
  )

  // SPEC J7.1, J7.2: the CSS is delivered wherever the render runs, here in
  // a helper module the server fn calls (the dev twin: rsc-css.test.ts).
  test('a render call in a helper module styles the server component', async ({
    pageErrors,
    openRscPage,
  }) => {
    const page = await openRscPage(server, helperRow.path)
    const selector = '[data-testid=helper-card]'
    await page.locator(selector).waitFor()
    await waitForHydration(page)
    expect(
      await settledValue(
        page,
        () => computedStyle(page, selector, 'background-color'),
        (value) => value === HELPER_CARD_BACKGROUND,
      ),
    ).toBe(HELPER_CARD_BACKGROUND)
    expect(pageErrors).toEqual([])
  })

  test.for(['renderable', 'composite', 'flight'])(
    'the %s row styles its server component',
    async (row, { pageErrors, openRscPage }) => {
      const page = await openRscPage(server, '/css')
      const selector = `section[data-row=${row}] [data-testid=card]`
      await page.locator(selector).waitFor()
      await waitForHydration(page)
      expect(
        await settledValue(
          page,
          () => computedStyle(page, selector, 'background-color'),
          (value) => value === CARD_BACKGROUND,
        ),
      ).toBe(CARD_BACKGROUND)
      expect(pageErrors).toEqual([])
    },
  )
})
