import { expect } from '@playwright/test'
import type { ConsoleMessage } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'

const whitelistErrors = [
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Failed to load resource: the server responded with a status of 504',
]

const routeFilenames = {
  index: 'index.tsx',
  root: '__root.tsx',
  child: 'child.tsx',
  inputs: 'inputs.tsx',
  componentHmrInlineSplit: 'component-hmr-inline-split.tsx',
  componentHmrInlineNosplit: 'component-hmr-inline-nosplit.tsx',
  componentHmrNamedSplit: 'component-hmr-named-split.tsx',
  componentHmrNamedNosplit: 'component-hmr-named-nosplit.tsx',
  componentHmrInlineErrorSplit: 'component-hmr-inline-error-split.tsx',
  componentHmrNamedErrorSplit: 'component-hmr-named-error-split.tsx',
} as const

type RouteFileKey = keyof typeof routeFilenames

const routeFiles = Object.fromEntries(
  Object.entries(routeFilenames).map(([key, filename]) => [
    key,
    path.join(process.cwd(), 'src/routes', filename),
  ]),
) as Record<RouteFileKey, string>

// Capture original file contents once so beforeEach can restore them
const originalContents: Partial<Record<RouteFileKey, string>> = {}

async function captureOriginals() {
  for (const [key, filePath] of Object.entries(routeFiles) as Array<
    [RouteFileKey, string]
  >) {
    originalContents[key] = await readFile(filePath, 'utf8')
  }
}

const capturePromise = captureOriginals()

async function replaceRouteText(
  routeFileKey: RouteFileKey,
  from: string,
  to: string,
) {
  const filePath = routeFiles[routeFileKey]
  const source = await readFile(filePath, 'utf8')

  if (!source.includes(from)) {
    throw new Error(`Expected route file to include ${JSON.stringify(from)}`)
  }

  await writeFile(filePath, source.replace(from, to))
}

async function replaceRouteTextAndWait(
  page: Page,
  routeFileKey: RouteFileKey,
  from: string,
  to: string,
  assertion: () => Promise<void>,
) {
  await replaceRouteText(routeFileKey, from, to)
  await assertion()
}

async function rewriteRouteFile(
  page: Page,
  routeFileKey: RouteFileKey,
  updater: (source: string) => string,
  assertion: () => Promise<void>,
) {
  const filePath = routeFiles[routeFileKey]
  const source = await readFile(filePath, 'utf8')
  const updated = updater(source)

  if (updated === source) {
    throw new Error(`Expected ${filePath} to change during rewrite`)
  }

  await writeFile(filePath, updated)
  await assertion()
}

/**
 * Returns a promise that resolves once Vite logs a client HMR update
 * for the given route filename. Must be called BEFORE the file write
 * so the listener is in place when the message arrives.
 */
function onNextHmrUpdate(page: Page, routeFilename: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const handler = (msg: ConsoleMessage) => {
      const text = msg.text()
      if (
        text.includes('[vite]') &&
        text.includes(routeFilename) &&
        (text.includes('hot updated') || text.includes('hmr update'))
      ) {
        page.off('console', handler)
        resolve()
      }
    }
    page.on('console', handler)
  })
}

async function waitForRouteLoaderCrumb(
  page: Page,
  routeId: string,
  crumb: string,
) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(
          ({ routeId }) => {
            const router = (window as any).__TSR_ROUTER__
            const loader = router?.routesById?.[routeId]?.options?.loader

            if (typeof loader !== 'function') {
              return null
            }

            return loader()?.crumb ?? null
          },
          { routeId },
        )
      } catch {
        return null
      }
    })
    .toBe(crumb)
}

async function waitForRouteRemovalReload(page: Page) {
  await page.waitForFunction(() => {
    const router = (window as any).__TSR_ROUTER__
    const match = router?.stores?.activeMatchesSnapshot?.state?.find(
      (entry: any) => entry.routeId === '/child',
    )

    return !match?.invalid && match?.isFetching === false
  })
}

async function reloadPageAndWait(page: Page, url: string) {
  await page.goto(url)
  await page.getByTestId('hydrated').waitFor({ state: 'visible' })
}

async function reloadPageAndWaitForText(
  page: Page,
  url: string,
  testId: string,
  text: string,
) {
  await reloadPageAndWait(page, url)
  await expect(page.getByTestId(testId)).toHaveText(text)
}

async function seedHomeState(page: Page) {
  await page.goto('/')
  await page.getByTestId('hydrated').waitFor({ state: 'visible' })
  await page.getByTestId('increment').click()
  await page.getByTestId('message').fill('index preserved')
  await page.getByTestId('root-message').fill('root preserved')
}

async function expectHomeStatePreserved(page: Page) {
  await expect(page.getByTestId('count')).toHaveText('Count: 1')
  await expect(page.getByTestId('message')).toHaveValue('index preserved')
  await expect(page.getByTestId('root-message')).toHaveValue('root preserved')
}

async function seedComponentHmrState(page: Page, url: string) {
  await page.goto(url)
  await page.getByTestId('hydrated').waitFor({ state: 'visible' })
  await page.getByTestId('component-hmr-increment').click()
  await page.getByTestId('component-hmr-message').fill('component preserved')
  await page.getByTestId('root-message').fill('root preserved')
}

async function expectComponentHmrStatePreserved(page: Page) {
  await expect(page.getByTestId('component-hmr-count')).toHaveText('Count: 1')
  await expect(page.getByTestId('component-hmr-message')).toHaveValue(
    'component preserved',
  )
  await expect(page.getByTestId('root-message')).toHaveValue('root preserved')
}

test.describe('react-start hmr', () => {
  test.use({ whitelistErrors })

  test.beforeEach(async () => {
    await capturePromise
    for (const [key, filePath] of Object.entries(routeFiles) as Array<
      [RouteFileKey, string]
    >) {
      const content = originalContents[key]
      if (content === undefined) continue
      const current = await readFile(filePath, 'utf8')
      if (current !== content) {
        await writeFile(filePath, content)
      }
    }
  })

  test.afterAll(async () => {
    await capturePromise
    for (const [key, filePath] of Object.entries(routeFiles) as Array<
      [RouteFileKey, string]
    >) {
      const content = originalContents[key]
      if (content === undefined) continue
      const current = await readFile(filePath, 'utf8')
      if (current !== content) {
        await writeFile(filePath, content)
      }
    }
  })

  test('preserves local state for code-split route component HMR', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('hmr state')

    await expect(page.getByTestId('count')).toHaveText('Count: 1')
    await expect(page.getByTestId('marker')).toHaveText('baseline')

    await replaceRouteTextAndWait(
      page,
      'index',
      'baseline',
      'updated',
      async () => {
        await expect(page.getByTestId('marker')).toHaveText('updated')
      },
    )

    await expect(page.getByTestId('count')).toHaveText('Count: 1')
    await expect(page.getByTestId('message')).toHaveValue('hmr state')
  })

  test('updates breadcrumb data when non-component route options change', async ({
    page,
  }) => {
    await page.goto('/child')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    await expect(page.getByTestId('child')).toHaveText('child')
    await expect(page.getByTestId('crumb-__root__')).toHaveText('Home')
    await expect(page.getByTestId('crumb-/child')).toHaveText('Child')

    await replaceRouteTextAndWait(
      page,
      'root',
      "crumb: 'Home'",
      "crumb: 'Home Updated'",
      async () => {
        await expect(page.getByTestId('crumb-__root__')).toHaveText(
          'Home Updated',
        )
      },
    )

    await expect(page.getByTestId('crumb-/child')).toHaveText('Child')
  })

  test('updates child route loader data without rebuilding the route tree', async ({
    page,
  }) => {
    await page.goto('/child')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })
    await page.getByTestId('root-message').fill('child preserved')

    await expect(page.getByTestId('crumb-/child')).toHaveText('Child')

    await replaceRouteTextAndWait(
      page,
      'child',
      "crumb: 'Child'",
      "crumb: 'Child Updated'",
      async () => {
        await expect(page.getByTestId('crumb-/child')).toHaveText(
          'Child Updated',
        )
      },
    )

    await expect(page.getByTestId('root-message')).toHaveValue(
      'child preserved',
    )
    await expect(page.getByTestId('child')).toHaveText('child')
  })

  test('adds a createFileRoute property during HMR', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })
    await page.getByTestId('root-message').fill('property added')
    await page.getByTestId('message').fill('index preserved')

    await expect(page.getByTestId('crumb-/')).toHaveCount(0)

    await rewriteRouteFile(
      page,
      'index',
      (source) =>
        source.replace(
          "export const Route = createFileRoute('/')({\n  component: Home,\n})",
          "export const Route = createFileRoute('/')({\n  loader: () => ({\n    crumb: 'Index Added',\n  }),\n  component: Home,\n})",
        ),
      async () => {
        await expect(page.getByTestId('crumb-/')).toHaveText('Index Added')
      },
    )

    await expect(page.getByTestId('root-message')).toHaveValue('property added')
    await expect(page.getByTestId('message')).toHaveValue('index preserved')
  })

  test('removes a createFileRoute property during HMR', async ({ page }) => {
    await page.goto('/child')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })
    await page.getByTestId('root-message').fill('property removed')

    await expect(page.getByTestId('crumb-/child')).toHaveText('Child')

    await rewriteRouteFile(
      page,
      'child',
      (source) =>
        source.replace("  loader: () => ({\n    crumb: 'Child',\n  }),\n", ''),
      async () => {
        await waitForRouteRemovalReload(page)
        await expect(page.getByTestId('crumb-/child')).toHaveCount(0)
      },
    )

    await expect(page.getByTestId('root-message')).toHaveValue(
      'property removed',
    )
    await expect(page.getByTestId('child')).toHaveText('child')
  })

  test('picks up latest child loader when navigating after multiple HMR saves', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    // First edit: change child loader while on /
    const hmr1 = onNextHmrUpdate(page, 'child.tsx')
    await replaceRouteText('child', "crumb: 'Child'", "crumb: 'Child Updated'")
    await hmr1

    // Second edit: change child loader again while still on /
    const hmr2 = onNextHmrUpdate(page, 'child.tsx')
    await replaceRouteText(
      'child',
      "crumb: 'Child Updated'",
      "crumb: 'Child Updated Again'",
    )
    await hmr2
    await waitForRouteLoaderCrumb(page, '/child', 'Child Updated Again')

    // Now navigate to /child — should see the LATEST value
    await page.getByTestId('child-link').click()
    await expect(page.getByTestId('child')).toBeVisible()

    await expect(page.getByTestId('crumb-/child')).toHaveText(
      'Child Updated Again',
      { timeout: 10000 },
    )
  })

  test('root route loader HMR preserves index route local state', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    // Set up local state in the index route
    await page.getByTestId('increment').click()
    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('preserve me')

    await expect(page.getByTestId('count')).toHaveText('Count: 2')
    await expect(page.getByTestId('crumb-__root__')).toHaveText('Home')

    // Change the root route's loader — should NOT reset index state
    await replaceRouteTextAndWait(
      page,
      'root',
      "crumb: 'Home'",
      "crumb: 'Home Updated'",
      async () => {
        await expect(page.getByTestId('crumb-__root__')).toHaveText(
          'Home Updated',
        )
      },
    )

    await expect(page.getByTestId('count')).toHaveText('Count: 2')
    await expect(page.getByTestId('message')).toHaveValue('preserve me')
  })

  test('preserves uncontrolled input state during HMR', async ({ page }) => {
    await page.goto('/inputs')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    // Type into both uncontrolled inputs
    await page.getByTestId('input-first').fill('first value')
    await page.getByTestId('input-second').fill('second value')

    await expect(page.getByTestId('inputs-marker')).toHaveText(
      'inputs-baseline',
    )

    // Trigger HMR by changing the marker text
    await replaceRouteTextAndWait(
      page,
      'inputs',
      'inputs-baseline',
      'inputs-updated',
      async () => {
        await expect(page.getByTestId('inputs-marker')).toHaveText(
          'inputs-updated',
        )
      },
    )

    // Both inputs should still have their typed values
    await expect(page.getByTestId('input-first')).toHaveValue('first value')
    await expect(page.getByTestId('input-second')).toHaveValue('second value')
  })

  test('updates beforeLoad context value during HMR', async ({ page }) => {
    await page.goto('/child')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })
    await page.getByTestId('root-message').fill('beforeLoad test')

    await expect(page.getByTestId('child-greeting')).toHaveText('Hello')

    // Change the beforeLoad return value
    await replaceRouteTextAndWait(
      page,
      'child',
      "greeting: 'Hello'",
      "greeting: 'Hi'",
      async () => {
        await expect(page.getByTestId('child-greeting')).toHaveText('Hi')
      },
    )

    // Root state should be preserved
    await expect(page.getByTestId('root-message')).toHaveValue(
      'beforeLoad test',
    )
    await expect(page.getByTestId('child')).toHaveText('child')
  })

  test('clears stale beforeLoad context when beforeLoad is removed', async ({
    page,
  }) => {
    await page.goto('/child')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })
    await page.getByTestId('root-message').fill('beforeLoad removal')

    await expect(page.getByTestId('child-greeting')).toHaveText('Hello')

    // Remove beforeLoad entirely
    await rewriteRouteFile(
      page,
      'child',
      (source) =>
        source.replace(
          "  beforeLoad: () => ({\n    greeting: 'Hello',\n  }),\n",
          '',
        ),
      async () => {
        await waitForRouteRemovalReload(page)
        await expect(page.getByTestId('child-greeting')).toHaveCount(0)
      },
    )

    // Root state should be preserved
    await expect(page.getByTestId('root-message')).toHaveValue(
      'beforeLoad removal',
    )
    await expect(page.getByTestId('child')).toHaveText('child')
    // Loader crumb should still work
    await expect(page.getByTestId('crumb-/child')).toHaveText('Child')
  })

  test('updates root route component during HMR when component is defined inline', async ({
    page,
  }) => {
    await rewriteRouteFile(
      page,
      'root',
      (source) =>
        source.replace(
          '  component: RootComponent,',
          '  component: () => <RootDocument marker="root-component-inline-baseline"><RootContent /></RootDocument>,',
        ),
      async () => {},
    )
    await page.waitForTimeout(300)

    await reloadPageAndWaitForText(
      page,
      '/',
      'root-component-marker',
      'root-component-inline-baseline',
    )
    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('index preserved')
    await page.getByTestId('root-message').fill('root preserved')

    await replaceRouteTextAndWait(
      page,
      'root',
      'root-component-inline-baseline',
      'root-component-inline-updated',
      async () => {
        await expect(page.getByTestId('root-component-marker')).toHaveText(
          'root-component-inline-updated',
        )
      },
    )
  })

  test('updates root route component during HMR when component is not defined inline', async ({
    page,
  }) => {
    await seedHomeState(page)

    await replaceRouteTextAndWait(
      page,
      'root',
      'root-component-baseline',
      'root-component-updated',
      async () => {
        await expect(page.getByTestId('root-component-marker')).toHaveText(
          'root-component-updated',
        )
      },
    )
  })

  test('updates root route shellComponent during HMR when shellComponent is defined inline', async ({
    page,
  }) => {
    await rewriteRouteFile(
      page,
      'root',
      (source) =>
        source.replace(
          '  component: RootComponent,',
          '  shellComponent: ({ children }) => <RootShellDocument marker="root-shell-inline-baseline">{children}</RootShellDocument>,\n  component: RootContent,',
        ),
      async () => {},
    )
    await page.waitForTimeout(300)

    await reloadPageAndWaitForText(
      page,
      '/',
      'root-shell-marker',
      'root-shell-inline-baseline',
    )
    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('index preserved')
    await page.getByTestId('root-message').fill('root preserved')

    await replaceRouteTextAndWait(
      page,
      'root',
      'root-shell-inline-baseline',
      'root-shell-inline-updated',
      async () => {
        await expect(page.getByTestId('root-shell-marker')).toHaveText(
          'root-shell-inline-updated',
        )
      },
    )
  })

  test('updates root route shellComponent during HMR when shellComponent is not defined inline', async ({
    page,
  }) => {
    await rewriteRouteFile(
      page,
      'root',
      (source) =>
        source
          .replace(
            '  component: RootComponent,',
            '  shellComponent: RootShell,\n  component: RootContent,',
          )
          .replace(
            'function Breadcrumbs() {',
            'function RootShell({ children }: { children: ReactNode }) {\n  return <RootShellDocument marker="root-shell-baseline">{children}</RootShellDocument>\n}\n\nfunction Breadcrumbs() {',
          ),
      async () => {},
    )
    await page.waitForTimeout(300)

    await reloadPageAndWaitForText(
      page,
      '/',
      'root-shell-marker',
      'root-shell-baseline',
    )
    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('index preserved')
    await page.getByTestId('root-message').fill('root preserved')

    await replaceRouteTextAndWait(
      page,
      'root',
      'root-shell-baseline',
      'root-shell-updated',
      async () => {
        await expect(page.getByTestId('root-shell-marker')).toHaveText(
          'root-shell-updated',
        )
      },
    )
  })

  test('updates non-root route component during HMR when component is defined inline and codeSplitGroupings is undefined', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-inline-split')

    await replaceRouteTextAndWait(
      page,
      'componentHmrInlineSplit',
      'component-hmr-inline-split-baseline',
      'component-hmr-inline-split-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-inline-split-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })

  test('updates non-root route component during HMR when component is defined inline and codeSplitGroupings disables code splitting', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-inline-nosplit')

    await replaceRouteTextAndWait(
      page,
      'componentHmrInlineNosplit',
      'component-hmr-inline-nosplit-baseline',
      'component-hmr-inline-nosplit-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-inline-nosplit-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })

  test('updates non-root route component during HMR when component is not defined inline and codeSplitGroupings is undefined', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-named-split')

    await replaceRouteTextAndWait(
      page,
      'componentHmrNamedSplit',
      'component-hmr-named-split-baseline',
      'component-hmr-named-split-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-named-split-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })

  test('updates non-root route component during HMR when component is not defined inline and codeSplitGroupings disables code splitting', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-named-nosplit')

    await replaceRouteTextAndWait(
      page,
      'componentHmrNamedNosplit',
      'component-hmr-named-nosplit-baseline',
      'component-hmr-named-nosplit-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-named-nosplit-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })

  test('updates non-root route component during HMR when component is defined inline and only errorComponent is split', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-inline-error-split')

    await replaceRouteTextAndWait(
      page,
      'componentHmrInlineErrorSplit',
      'component-hmr-inline-error-split-baseline',
      'component-hmr-inline-error-split-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-inline-error-split-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })

  test('updates non-root route component during HMR when component is not defined inline and only errorComponent is split', async ({
    page,
  }) => {
    await seedComponentHmrState(page, '/component-hmr-named-error-split')

    await replaceRouteTextAndWait(
      page,
      'componentHmrNamedErrorSplit',
      'component-hmr-named-error-split-baseline',
      'component-hmr-named-error-split-updated',
      async () => {
        await expect(page.getByTestId('component-hmr-marker')).toHaveText(
          'component-hmr-named-error-split-updated',
        )
      },
    )

    await expectComponentHmrStatePreserved(page)
  })
})
