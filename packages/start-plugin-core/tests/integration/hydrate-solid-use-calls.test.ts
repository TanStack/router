/**
 * `use*` calls in the children of a Solid `<Hydrate>` boundary (R101: Solid
 * has no rules of hooks, so the split is not refused there): a primitive of
 * the app reading a context and the owner, and `Route.useParams()` of a file
 * route. A production build of a Solid Start app with each bundler (Vite:
 * `createStartHost({ serve: false })` + `preview()`; Rsbuild: `buildStart` +
 * `preview()`) serves `/items/abc`; Chromium hydrates the page, the boundary
 * opens, and its children show the provider's value, an owner and the
 * route's param, and count a click.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { buildStart } from '../build-harness'
import { createStartHost } from '../start-host'
import { solidAppConfig } from './hydrate-pages'
import type { StartBundler } from '../build-harness'

const timeout = 90_000

const routeFiles = {
  'src/tone.ts': `import { createContext } from 'solid-js'
export const Tone = createContext('no-provider')
`,
  'src/routes/items.$id.tsx': `import { createFileRoute } from '@tanstack/solid-router'
import { Hydrate } from '@tanstack/solid-start'
import { idle } from '@tanstack/solid-start/hydration'
import { createSignal, getOwner, useContext } from 'solid-js'
import { Tone } from '../tone'
function useTone() {
  return useContext(Tone) + (getOwner() ? ':owned' : ':unowned')
}
export const Route = createFileRoute('/items/$id')({ component: Page })
function Page() {
  const [clicks, setClicks] = createSignal(0)
  return (
    <Tone.Provider value="provided">
      <Hydrate when={idle()}>
        <p data-tone>{useTone()}</p>
        <p data-param>{Route.useParams()().id}</p>
        <button data-count onClick={() => setClicks(clicks() + 1)}>{'clicks:' + clicks()}</button>
      </Hydrate>
    </Tone.Provider>
  )
}
`,
}

/** Rsbuild: the app's own entries (Start's defaults, as an app writes them) and router. */
const rsbuildFiles = {
  ...routeFiles,
  'src/client.tsx': `import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start/client'
hydrate(() => <StartClient />, document)
`,
  'src/server.ts': `export { default } from '@tanstack/solid-start/server-entry'\n`,
  'src/router.ts': `import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
export const Route = createRootRoute({
  component: () => <Outlet />,
  shellComponent: (props) => (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  ),
})
`,
}

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }
  let url: string
  beforeAll(async () => {
    url = await serve(bundler, registerCleanup)
  }, timeout)
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  test(
    'split children calling use* primitives keep their owner, context and route match',
    async () => {
      const page = await openPage(new URL('/items/abc', url).href, {
        registerCleanup: onTestFinished,
      })
      await page.page.locator('button[data-count]').click()
      await page.waitForText('clicks:1', { selector: 'button[data-count]' })
      expect({
        tone: await page.page.locator('[data-tone]').textContent(),
        param: await page.page.locator('[data-param]').textContent(),
        pageErrors: page.errors,
      }).toEqual({ tone: 'provided:owned', param: 'abc', pageErrors: [] })
    },
    timeout,
  )
})

async function serve(
  bundler: StartBundler,
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<string> {
  if (bundler === 'vite') {
    const host = await createStartHost({
      framework: 'solid',
      serve: false,
      files: routeFiles,
    })
    registerCleanup(() => host.close())
    return (await host.preview()).url
  }
  const build = await buildStart({
    bundler,
    framework: 'solid',
    registerCleanup,
    rsbuildConfig: solidAppConfig.rsbuildConfig,
    files: rsbuildFiles,
  })
  return (await build.preview(registerCleanup)).url
}
