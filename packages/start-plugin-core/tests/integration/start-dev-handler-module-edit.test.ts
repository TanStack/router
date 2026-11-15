/**
 * A server fn's lazy handler module in development (SSR as the provider,
 * R157): a declaration only the handler reads, whose evaluation reads state
 * its module keeps, stays in the module and runs at load (`snapshot`, read
 * before `set(cfg)` writes `cfg`). After an edit of that declaration, and
 * after an edit of the handler, server code (the route's loader, on the
 * server render) and a client call over HTTP both see the edited code, with
 * the value the source gives. The same for a handler that stays in its
 * module (it assigns a binding the module keeps, R157 rule 5), which the
 * registry reaches through the module's lazy module (R158 rule 3). On Vite's
 * and Rsbuild's dev servers.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { pluginReact } from '@rsbuild/plugin-react'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile } from './start-compose-app'

const timeout = 90_000

/** `src/fns.ts`: `pinned` is the pinned declaration's mark, `handler` the handler's. */
const fns = (pinned: string, handler: string) =>
  `import { createServerFn } from '@tanstack/react-start'
const cfg = { url: 'a' }
const snapshot = cfg.url + ':${pinned}'
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const read = createServerFn().handler(() => snapshot + '/' + cfg.url + '/${handler}')
`

/** `src/kept.ts`: a handler writing what its module keeps (it stays in place); `mark` is the handler's. */
const kept = (mark: string) =>
  `import { createServerFn } from '@tanstack/react-start'
let last = ''
export const lastKept = () => last
export const keep = createServerFn().handler(() => (last = '${mark}'))
`

/** `src/lazy-schema.ts`: a validator only the lazy module's server fn imports; `mark` is its. */
const lazySchema = (mark: string) =>
  `export const schema = (data: unknown) => ({ ...(data as object), s: '${mark}' })\n`

/** `src/routes/stubbed.tsx`: a server fn only the split component calls (R158: the lazy module holds it); `mark` is the handler's. */
const lazyRoute = (mark: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { schema } from '../lazy-schema'
const lazyFn = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(({ data }) => data.s + '/${mark}')
export const Route = createFileRoute('/stubbed')({ component: Page })
function Page() {
  const [text, setText] = useState('idle')
  return <button data-testid="lazy-probe" onClick={async () => setText('client=' + (await lazyFn({ data: {} })))}>{text}</button>
}
`

/** `src/stop-schema.ts`: counts its validations (one instance: 1, 2 in one page); `mark` is its. */
const stopSchema = (mark: string) =>
  `let n = 0
export const schema = (data: unknown) => ({ ...(data as object), s: '${mark}', n: ++n })
`

/**
 * `src/routes/stop.tsx`, the step-4 stop's shape (R158 amendment): the
 * loader calls `list`, whose lazy handler keeps Start's loader in the route
 * module; `save`, only the split component calls, lives in the lazy module.
 */
const stopRoute = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { schema } from '../stop-schema'
const list = createServerFn().handler(async () => 'L')
const save = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(({ data }) => data.s + ':' + data.n)
export const Route = createFileRoute('/stop')({ loader: () => list(), component: Page })
function Page() {
  const loaded = Route.useLoaderData()
  const [text, setText] = useState('idle')
  return <button data-testid="stop-probe" onClick={async () => setText('client=' + loaded + '/' + (await save({ data: {} })))}>{text}</button>
}
`

const files = {
  'src/stop-schema.ts': stopSchema('S1'),
  'src/routes/stop.tsx': stopRoute,
  'src/lazy-schema.ts': lazySchema('S1'),
  'src/routes/stubbed.tsx': lazyRoute('H1'),
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  'src/fns.ts': fns('P1', 'H1'),
  'src/kept.ts': kept('K1'),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { read } from '../fns'
import { keep } from '../kept'
export const Route = createFileRoute('/')({
  loader: async () => (await read()) + '|' + (await keep()),
  component: Page,
})
function Page() {
  const [text, setText] = useState('idle')
  return (
    <>
      <p data-testid="loader">{'loader=' + Route.useLoaderData()}</p>
      <button data-testid="probe" onClick={async () => setText('client=' + (await read()) + '|' + (await keep()))}>{text}</button>
    </>
  )
}
`,
}

interface Served {
  url: string
  edit: (files: Record<string, string>) => Promise<unknown>
}

const servers: Record<string, () => Promise<Served>> = {
  vite: async () => {
    const server = await startDevServer({ browser: true, files })
    return { url: server.url!, edit: (f) => server.edit(f) }
  },
  rsbuild: async () => {
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { plugins: [pluginReact()] },
      files,
    })
    return { url: server.url!, edit: (f) => server.edit(f) }
  },
}

describe.each(Object.keys(servers))('%s dev', (bundler) => {
  test(
    'edits of a pinned declaration, of the handler and of a handler kept in place reach server code and HTTP calls',
    async () => {
      const server = await servers[bundler]!()
      /** The server render's loader value, once it is `expected`. */
      const rendered = async (expected: string) => {
        let last = ''
        await waitForOutcome({
          applied: async () =>
            (last = await (await fetch(server.url)).text()).includes(
              `loader=${expected}`,
            ),
          timeout: 10_000,
          describe: () => `the server render: ${last.slice(0, 400)}`,
        })
      }
      /** What a client call over HTTP gives, from a fresh page. */
      const called = async () => {
        const page = await openPage(server.url, {
          registerCleanup: onTestFinished,
        })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.page.locator('[data-testid=probe]').click()
        await page.waitForText(/client=/, { selector: '[data-testid=probe]' })
        return page.text('[data-testid=probe]')
      }

      await rendered('a:P1/b/H1|K1')
      expect(await called()).toBe('client=a:P1/b/H1|K1')

      await server.edit({ 'src/fns.ts': fns('P2', 'H1') })
      await rendered('a:P2/b/H1|K1')
      expect(await called()).toBe('client=a:P2/b/H1|K1')

      await server.edit({ 'src/fns.ts': fns('P2', 'H2') })
      await rendered('a:P2/b/H2|K1')
      expect(await called()).toBe('client=a:P2/b/H2|K1')

      await server.edit({ 'src/kept.ts': kept('K2') })
      await rendered('a:P2/b/H2|K2')
      expect(await called()).toBe('client=a:P2/b/H2|K2')
    },
    timeout,
  )

  test(
    "edits of a module only the lazy module's server fn imports and of its handler reach HTTP calls (R158)",
    async () => {
      const server = await servers[bundler]!()
      /** What a client call over HTTP gives, from a fresh page of the route. */
      const called = async () => {
        const page = await openPage(`${server.url}stubbed`, {
          registerCleanup: onTestFinished,
        })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.page.locator('[data-testid=lazy-probe]').click()
        await page.waitForText(/client=/, {
          selector: '[data-testid=lazy-probe]',
        })
        return page.text('[data-testid=lazy-probe]')
      }
      /** The call's result, once it is `expected`. */
      const reaches = async (expected: string) => {
        let last = ''
        await waitForOutcome({
          applied: async () => (last = await called()) === expected,
          timeout: 15_000,
          describe: () => `the HTTP call: ${last}`,
        })
      }

      await reaches('client=S1/H1')
      await server.edit({ 'src/lazy-schema.ts': lazySchema('S2') })
      await reaches('client=S2/H1')
      await server.edit({ 'src/routes/stubbed.tsx': lazyRoute('H2') })
      await reaches('client=S2/H2')
    },
    timeout,
  )

  test(
    "the step-4 stop's shape: an edit of a module only the lazy module's chain reads reaches HTTP calls, one instance (R158 amendment)",
    async () => {
      const server = await servers[bundler]!()
      /** Two client calls over HTTP from one fresh page of the route. */
      const calledTwice = async () => {
        const page = await openPage(`${server.url}stop`, {
          registerCleanup: onTestFinished,
        })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        const results: Array<string> = []
        for (const before of ['idle', null]) {
          const was = before ?? results[0]!
          await page.page.locator('[data-testid=stop-probe]').click()
          await page.page.waitForFunction(
            (text) =>
              document.querySelector('[data-testid=stop-probe]')
                ?.textContent !== text,
            was,
          )
          results.push(await page.text('[data-testid=stop-probe]'))
        }
        return results.join(' ')
      }
      let last = ''
      /** Two calls answered by the `mark` validator, one instance counting on (n, n + 1). */
      const reaches = (mark: string) =>
        waitForOutcome({
          applied: async () => {
            last = await calledTwice()
            const m = new RegExp(
              `^client=L/${mark}:(\\d+) client=L/${mark}:(\\d+)$`,
            ).exec(last)
            return m !== null && Number(m[2]) === Number(m[1]) + 1
          },
          timeout: 15_000,
          describe: () => `the HTTP calls: ${last}`,
        })

      await reaches('S1')
      await server.edit({ 'src/stop-schema.ts': stopSchema('S2') })
      await reaches('S2')
    },
    timeout,
  )
})
