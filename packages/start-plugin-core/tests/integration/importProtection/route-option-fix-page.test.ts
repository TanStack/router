/**
 * The fix an import-protection report suggests for a browser-only
 * (`*.client.*`) component a route option renders on the server, applied
 * as written (R101: the fix a message gives works): `errorComponent`
 * receives the router's props (the error), and the suggested
 * `<ClientOnly>` wrapper passes them on. Production builds on Vite and
 * Rsbuild with import protection on, served as each bundler's preview
 * serves them, in a browser.
 * Source: Astra review of #8817, hydrate #7 (the wrapper dropped the props:
 * the error component read `undefined.message`).
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
import { buildStart, startBundlers } from '../../build-harness'
import { createStartHost } from '../../start-host'
import { rsbuildEntries } from '../route-css-cases'

const timeout = 60_000

const files = {
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/oops.client.tsx': `import type { ErrorComponentProps } from '@tanstack/react-router'
export function Oops({ error }: ErrorComponentProps) {
  return <p data-testid="oops">{window.location.pathname}: {error.message}</p>
}
`,
  // the report's fix of `errorComponent: Oops`, written as it says
  'src/routes/index.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Oops } from '../oops.client'
export const Route = createFileRoute('/')({
  loader: () => {
    throw new Error('MARK_LOADER_ERROR')
  },
  errorComponent: (props) => <ClientOnly fallback={null}><Oops {...props} /></ClientOnly>,
})
`,
}

const importProtection = { importProtection: { enabled: true } }

describe.each(startBundlers)('%s build', (bundler) => {
  const cleanups: Array<() => Promise<void>> = []
  const registerCleanup = (cleanup: () => Promise<void>) => {
    cleanups.push(cleanup)
  }
  let url: string
  beforeAll(async () => {
    if (bundler === 'vite') {
      const host = await createStartHost({
        serve: false,
        files,
        start: importProtection,
      })
      registerCleanup(() => host.close())
      url = (await host.preview()).url
    } else {
      const build = await buildStart({
        bundler,
        registerCleanup,
        files: { ...rsbuildEntries, ...files },
      })
      expect(build.violations).toEqual([])
      url = (await build.preview(registerCleanup)).url
    }
  }, timeout)
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  test('the suggested <ClientOnly> wrapper of an errorComponent renders the route error in the browser', async () => {
    const page = await openPage(new URL('/', url).href, {
      registerCleanup: onTestFinished,
    })
    await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
    await page.waitForText('/: MARK_LOADER_ERROR', {
      selector: '[data-testid=oops]',
    })
  })
})
