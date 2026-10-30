/**
 * A route module's first server fn on Start's Rsbuild dev server: an edit
 * that adds `createServerFn` to a code-split route whose page is open shows
 * on the page as a hot update (SPEC J3.1, J3.3, G10). Found by Lane F's
 * soak replay. Known bug, upstream (Rspack's HMR runtime, KNOWN-BUGS
 * "Upstream issues"): when the modules the route's component chunk gained
 * land in a new async chunk (Rspack's default `defaultVendors` cache group
 * on Start's `chunks: 'async'` client), the hot update of the already
 * loaded component chunk re-executes the route's component module, which
 * requires them before anything loads the new chunk (`Cannot read
 * properties of undefined (reading 'call')`; web-infra-dev/rspack#11324,
 * #11922). A plain Rsbuild app fails the same way. A loader-only edit works
 * (the loader chunk loads only when the loader runs), and so does the same
 * component edit when the client entry already imports a server fn (the
 * runtime is in the entry chunk: no new chunk).
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { reactApp } from '../hydrate-dev-edits'
import { loaderRoute } from '../route-edits-after-tree-rebuild'

const timeout = 90_000

/** The loader route with a server fn the loader calls; its component shows the result. */
const serverFnInLoader = (
  token: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
const getToken = createServerFn().handler(() => '${token}')
export const Route = createFileRoute('/with-loader')({
  loader: async () => ({ probe: await getToken() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p data-probe="loader">{data.probe}</p>
}
`

/** The loader route with a server fn its component calls once mounted, showing the result. */
const serverFnInComponent = (
  token: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
const getToken = createServerFn().handler(() => '${token}')
export const Route = createFileRoute('/with-loader')({
  loader: async () => ({ probe: '${token}' }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const [token, setToken] = useState('')
  useEffect(() => {
    getToken().then(setToken)
  }, [])
  return (
    <div>
      <p data-probe="loader">{data.probe}</p>
      <p data-probe="server-fn">{token}</p>
    </div>
  )
}
`

/** A module of the client entry that already uses the server fn runtime. */
const warmup = `import { createServerFn } from '@tanstack/react-start'
export const ping = createServerFn().handler(() => 'pong')
`

/**
 * Opens the loader route's page, edits the route so that its `target`
 * calls a server fn, and checks the page shows the server fn's result,
 * without a reload or an error. `warm`: the client entry already imports
 * a server fn (the runtime is in the client bundle before the edit).
 */
async function editInFirstServerFn(options: {
  target: 'loader' | 'component'
  warm?: boolean
}) {
  const server = await startRsbuildStartDevServer({
    hmr: true,
    browser: true,
    // Start serves the pages, not an HTML template.
    config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
    files: {
      ...reactApp,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>index</p> })
`,
      'src/routes/with-loader.tsx': loaderRoute('probe-v0'),
      ...(options.warm && {
        'src/warmup.ts': warmup,
        'harness/client-entry.ts': `import '../src/warmup'\n${reactApp['harness/client-entry.ts']}`,
      }),
    },
  })
  expect(reportedErrors(server)).toEqual([])
  const page = await openPage(`${server.url}/with-loader`, {
    registerCleanup: onTestFinished,
  })
  await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  await page.waitForText('probe-v0', { selector: '[data-probe=loader]' })

  const route =
    options.target === 'loader' ? serverFnInLoader : serverFnInComponent
  await server.edit({ 'src/routes/with-loader.tsx': route('probe-v1') })
  expect(reportedErrors(server)).toEqual([])
  const shows =
    options.target === 'loader'
      ? '[data-probe=loader]'
      : '[data-probe=server-fn]'
  // The outcome: the page shows the result; an error of the page ends the
  // wait at once (SPEC G10).
  const shown = () =>
    page.page.evaluate(
      (selector: string) => document.querySelector(selector)?.textContent ?? '',
      shows,
    )
  await waitForOutcome({
    applied: async () => (await shown()).includes('probe-v1'),
    problems: () => page.errors,
    timeout: 20_000,
    describe: async () => `the page shows ${JSON.stringify(await page.text())}`,
  })
  expect(page.errors).toEqual([])
  expect(page.loads()).toBe(1)
}

describe('Rsbuild dev: a route module gains its first server fn', () => {
  test(
    'an edit that adds a server fn to the loader shows its result on the open page',
    () => editInFirstServerFn({ target: 'loader' }),
    timeout,
  )

  // Known bug (upstream, see the module comment): the component chunk's
  // hot update throws, the route renders nothing.
  test.fails(
    'an edit that adds a server fn to the component shows its result on the open page',
    () => editInFirstServerFn({ target: 'component' }),
    timeout,
  )

  // The control: with the server fn runtime in the entry chunk, the same
  // component edit adds no chunk and shows.
  test(
    'the component edit shows when the client entry already imports a server fn',
    () => editInFirstServerFn({ target: 'component', warm: true }),
    timeout,
  )
})
