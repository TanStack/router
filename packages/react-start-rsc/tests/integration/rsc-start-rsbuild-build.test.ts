/**
 * A production build of a React Start app with RSC enabled on Rsbuild
 * (`rsc-app.ts`: `rsbuild build`, served by `rsbuild preview`) in a real
 * page: a server function only its route's component calls (SPEC J4.1, J2:
 * the component is split, the server fn's module renders on the server
 * with its SSR stub). The dev counterpart is rsc-start-rsbuild.test.ts.
 * Pinned in the same build: server fns only client-only code imports
 * (`client-only-reach-app.ts`).
 */
import { expect } from 'vitest'
import {
  clickOutcome,
  clientOnlyPositions,
  clientOnlyReachFiles,
} from './client-only-reach-app'
import {
  answeredText,
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'
import { test } from './test'
import { answer } from './rsc-reach-app'
import type { RscPreviewServer } from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'
import type { RscFixtures } from './test'

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

let server: RscPreviewServer & { errors: Array<string> }

test.beforeAll(async ({ fileRoot }) => {
  server = await startRscRsbuildPreviewServer(fileRoot, {
    files: {
      ...privateFnFiles,
      ...clientOnlyReachFiles,
      // A server fn whose only importer is a `'use client'` component that
      // a server component renders.
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
  return <main>{Route.useLoaderData().tree}</main>
}
`,
      'src/routes/component-fn.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const greet = createServerFn().handler(async () => 'MARK_HANDLER')
export const Route = createFileRoute('/component-fn')({
  component: Page,
})
function Page() {
  const call = useServerFn(greet)
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_PAGE</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => call().then(setCalled)}>call</button>
    </main>
  )
}
`,
    },
  })
  return () => server.close()
})

// Found by the react-start/rsc e2e app (rsbuild-ssr): the SSR output named
// the server fn's SSR stub without importing it, so every page failed.
test("a server fn only its route's component calls renders on the server and answers the browser", async ({
  openRscPage,
}) => {
  expect(server.errors).toEqual([])
  const page = await openRscPage(server, '/component-fn')
  await page.locator('[data-testid=label]', { hasText: 'MARK_PAGE' }).waitFor()
  await waitForHydration(page)
  await page.locator('[data-testid=call]').click()
  await page
    .locator('[data-testid=called]', { hasText: 'called MARK_HANDLER' })
    .waitFor()
})

// SPEC J4.2: a server fn the client calls is callable by id (#7943): the
// server compilation's last settlement run builds the resolver again once
// the client compiled, from what it calls (db260cf3a3 and 0a261a0259:
// "Server function info not found").
test("a server fn only a 'use client' component of a server component imports runs when clicked", async ({
  openRscPage,
}) => {
  const page = await openRscPage(server, '/client-ref')
  await page.locator('[data-testid=counter]').waitFor()
  await waitForHydration(page)
  await page.locator('[data-testid=counter]').click()
  expect(
    await answeredText(
      page,
      '[data-testid=counter]',
      (text) => text.includes('MARK_UPDATED') || text.includes('error'),
    ),
  ).toBe('counter MARK_UPDATED')
})

// SPEC J4.2: a server fn only client-only code imports (`<ClientOnly>`
// children, `createClientOnlyFn` bodies, `<Hydrate>` fallbacks, which the
// SSR scan erases) is callable by id: the server compilation's last
// settlement run builds the resolver again once the client compiled, from
// what it calls (db260cf3a3 and 0a261a0259: "Server function info not
// found").
test.for(clientOnlyPositions)(
  'a server fn only $position of a $where imports runs when clicked',
  async ({ name }, { page }) => {
    expect(await clickOutcome(page, server, name)).toEqual(answer(name))
  },
)

// SPEC J4.2: in a production build only server functions client code
// calls are callable over HTTP (R182). `internal` and `sameFile` are called by `greet`'s
// handler only (a server-origin call, which works); a request by its URL
// from the browser is refused, while the same request to `greet` answers.
// With a separate provider the provider builds before the client, so the
// refusal is decided where the HTTP handler runs, after the client built.
test('a server function only server code calls is not callable from the browser', async ({
  page,
}) => {
  await expectOnlyClientCalledFnsCallable(page, server)
})

/**
 * `/private` of `privateFnFiles`: `greet` (the client calls it) answers a
 * request from the browser by its URL, `internal` and `sameFile` (called by
 * `greet`'s handler only, a server-origin call, which works) are refused.
 */
async function expectOnlyClientCalledFnsCallable(
  page: Page,
  server: RscPreviewServer,
) {
  await openRscPage(page, server, '/private')
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
  // R182: also a server fn of a module the client imports, which no client
  // code calls
  const refusedSameFile = await call(urls.sameFile)
  expect(refusedSameFile.ok).toBe(false)
  expect(refusedSameFile.value ?? '').not.toContain('MARK_SAME_FILE')
}

/** A production build of `privateFnFiles` with `options`, for one test. */
function privateFnServer(
  serve: RscFixtures['startRscRsbuildPreviewServer'],
  options: {
    start?: Record<string, unknown>
    tools?: Record<string, unknown>
  },
) {
  return serve({ ...options, files: privateFnFiles })
}

// Astra review 2 (B1): the gate's ids are filled into the server's JS
// assets after the client built; a server output whose chunks are `.mjs`
// (the resolver sits in one) kept the placeholder, so every client call
// was refused. The entry stays `index.js`, which preview loads.
test('the browser calls a server fn of a server build whose chunks are .mjs', async ({
  page,
  startRscRsbuildPreviewServer,
}) => {
  const built = await privateFnServer(startRscRsbuildPreviewServer, {
    tools: {
      rspack: (
        config: { output: Record<string, unknown> },
        { environment }: { environment: { name: string } },
      ) => {
        if (environment.name === 'ssr') {
          config.output.filename = (data: { chunk?: { name?: string } }) =>
            data.chunk?.name === 'index' ? '[name].js' : '[name].mjs'
          config.output.chunkFilename = '[name].mjs'
        }
      },
    },
  })
  await expectOnlyClientCalledFnsCallable(page, built)
})

// Astra review 2 (B2): custom ids are text, not replacement patterns. With
// `$$` read as `$` the gate held `rv$greet` instead of `rv$$greet`: `greet`
// was refused and `internal`, a function only server code calls, answered;
// with `$&` the server bundle did not parse.
test('custom ids with $ patterns gate the same functions', async ({
  page,
  startRscRsbuildPreviewServer,
}) => {
  const ids: Record<string, string> = {
    greet_createServerFn_handler: 'rv$$greet',
    internal_createServerFn_handler: 'rv$greet',
    urls_createServerFn_handler: 'rv$&urls',
  }
  const built = await privateFnServer(startRscRsbuildPreviewServer, {
    start: {
      serverFns: {
        generateFunctionId: ({ functionName }: { functionName: string }) =>
          ids[functionName],
      },
    },
  })
  await expectOnlyClientCalledFnsCallable(page, built)
})

// SPEC J4.2 (R182): an app whose client calls no server fn builds; its
// server fns answer server code (the route's server-only loader) and the
// browser's request by id is refused, as the resolver of the client's
// empty publication gates it.
test('a client that calls no server fn: server code calls one, the browser is refused', async ({
  openRscPage,
  startRscRsbuildPreviewServer,
}) => {
  const built = await startRscRsbuildPreviewServer({
    files: {
      'src/quiet/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const serverOnly = createServerFn().handler(() => 'MARK_SERVER_ONLY')
`,
      'src/routes/quiet.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerOnlyFn } from '@tanstack/react-start'
import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { serverOnly } from '../quiet/fns'
const load = createServerOnlyFn(async () => ({
  value: await serverOnly(),
  url: serverOnly.url,
}))
export const Route = createFileRoute('/quiet')({
  loader: () => load(),
  component: Page,
})
if (typeof window !== 'undefined') {
  // Start's own client RPC of an id: the request a stub would send
  ;(window as any).callId = async (id: string) => {
    try {
      const reply = await createClientRpc(id)({})
      return 'error' in reply ? 'refused' : 'answered ' + String(reply.result)
    } catch {
      return 'refused'
    }
  }
}
function Page() {
  const data = Route.useLoaderData()
  return (
    <main>
      <p data-testid="value">{data.value}</p>
      <p data-testid="url">{data.url}</p>
    </main>
  )
}
`,
    },
  })
  expect(built.errors).toEqual([])
  const page = await openRscPage(built, '/quiet')
  await page
    .locator('[data-testid=value]', { hasText: 'MARK_SERVER_ONLY' })
    .waitFor()
  await waitForHydration(page)
  const url = (await page.locator('[data-testid=url]').textContent())!
  const id = url.slice(url.lastIndexOf('/') + 1)
  expect(await page.evaluate((fnId) => (window as any).callId(fnId), id)).toBe(
    'refused',
  )
})
