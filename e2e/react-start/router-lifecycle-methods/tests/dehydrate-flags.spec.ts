import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated, hydrationPayload } from './utils'

// ============================================================================
// Transport flags, black-box through createIsomorphicFn.
//
// Each route's lifecycles return 'server-{prefix}-{method}' on the server and
// 'client-{prefix}-{method}' in the browser.
//
// Transported lifecycle  -> the server value is restored from the payload at
//                           hydration -> DOM shows 'server-*'
// Not transported        -> the client re-runs the lifecycle in place at
//                           hydration -> DOM shows 'client-*'
//
// Builtin defaults: context false, beforeLoad true, loader
// true. There is no app-wide override; each route states its flags.
// ============================================================================

interface RouteTransport {
  path: string
  prefix: string
  heading: string
  /** effective transport per lifecycle for this route */
  context: boolean
  beforeLoad: boolean
  loader: boolean
}

const routes: Array<RouteTransport> = [
  {
    path: '/dehydrate-defaults',
    prefix: 'dd',
    heading: 'Dehydrate Defaults',
    context: false,
    beforeLoad: true,
    loader: true,
  },
  {
    path: '/dehydrate-all-true',
    prefix: 'dat',
    heading: 'Dehydrate All True',
    context: true,
    beforeLoad: true,
    loader: true,
  },
  {
    path: '/dehydrate-all-false',
    prefix: 'daf',
    heading: 'Dehydrate All False',
    context: false,
    beforeLoad: false,
    loader: false,
  },
  {
    path: '/dehydrate-mixed',
    prefix: 'dm',
    heading: 'Dehydrate Mixed',
    context: true,
    beforeLoad: false,
    loader: true,
  },
  {
    path: '/dehydrate-beforeload-false',
    prefix: 'dbf',
    heading: 'Dehydrate BeforeLoad False',
    context: false,
    beforeLoad: false,
    loader: true,
  },
  {
    path: '/dehydrate-loader-false',
    prefix: 'dlf',
    heading: 'Dehydrate Loader False',
    context: false,
    beforeLoad: true,
    loader: false,
  },
  {
    path: '/dehydrate-context-true',
    prefix: 'dct',
    heading: 'Dehydrate Context True',
    context: true,
    beforeLoad: true,
    loader: true,
  },
]

function value(prefix: string, method: string, fromServer: boolean) {
  return `${fromServer ? 'server' : 'client'}-${prefix}-${method}`
}

/**
 * 'ssr'       direct visit: transported values are server values, the rest
 *             is re-run on the client during hydration.
 * 'clientNav' link click after hydration: everything runs in the browser.
 * 'roundTrip' direct visit, navigate away, navigate back: context is memoized
 *             per match (keeps its hydrated value), beforeLoad re-runs on every
 *             load, the loader is stale (staleTime 0) and re-runs.
 */
function expected(
  route: RouteTransport,
  mode: 'ssr' | 'clientNav' | 'roundTrip',
) {
  const { prefix } = route
  if (mode === 'clientNav') {
    return {
      context: value(prefix, 'context', false),
      beforeLoad: value(prefix, 'beforeLoad', false),
      loader: value(prefix, 'loader', false),
    }
  }
  if (mode === 'ssr') {
    return {
      context: value(prefix, 'context', route.context),
      beforeLoad: value(prefix, 'beforeLoad', route.beforeLoad),
      loader: value(prefix, 'loader', route.loader),
    }
  }
  return {
    context: value(prefix, 'context', route.context),
    beforeLoad: value(prefix, 'beforeLoad', false),
    loader: value(prefix, 'loader', false),
  }
}

async function expectValues(
  page: import('@playwright/test').Page,
  route: RouteTransport,
  values: ReturnType<typeof expected>,
) {
  await expect(page.getByTestId(`${route.prefix}-context`)).toHaveText(
    values.context,
  )
  await expect(page.getByTestId(`${route.prefix}-beforeLoad`)).toHaveText(
    values.beforeLoad,
  )
  await expect(page.getByTestId(`${route.prefix}-loader`)).toHaveText(
    values.loader,
  )
}

const methods = ['context', 'beforeLoad', 'loader'] as const

test.describe('transport flags - SSR and hydration', () => {
  for (const route of routes) {
    test(`${route.path}: the wire carries only the transported values, the DOM shows them after hydration`, async ({
      page,
    }) => {
      const response = await page.goto(route.path)
      expect(response?.status()).toBe(200)
      const html = await response!.text()
      const payload = hydrationPayload(html)
      // data-only: the component is not server-rendered, so a server value can
      // reach the HTML only through the hydration payload (presence protocol)
      expect(html).not.toContain(`data-testid="${route.prefix}-component"`)
      for (const method of methods) {
        const serverValue = value(route.prefix, method, true)
        if (route[method]) {
          expect(payload, `${method} is transported`).toContain(serverValue)
        } else {
          expect(html, `${method} is not transported`).not.toContain(
            serverValue,
          )
        }
        // a client value never comes out of the server
        expect(html).not.toContain(value(route.prefix, method, false))
      }

      await awaitHydrated(page)
      await expect(page.getByTestId(`${route.prefix}-heading`)).toHaveText(
        route.heading,
      )
      await expectValues(page, route, expected(route, 'ssr'))
    })
  }
})

test.describe('transport flags - client navigation', () => {
  for (const route of routes) {
    test(`client nav to ${route.path}: everything runs in the browser`, async ({
      page,
    }) => {
      await page.goto('/')
      await awaitHydrated(page)
      await expect(page.getByTestId('index-heading')).toHaveText('Home')

      await page.getByTestId(`link-${route.path.slice(1)}`).click()
      await expect(page.getByTestId(`${route.prefix}-heading`)).toHaveText(
        route.heading,
      )
      await expectValues(page, route, expected(route, 'clientNav'))
    })
  }

  test('navigating between flag routes preserves root context', async ({
    page,
  }) => {
    await page.goto('/dehydrate-defaults')
    await awaitHydrated(page)
    await expect(page.getByTestId('root-context')).toHaveText('root-context')

    await page.getByTestId('link-dehydrate-all-true').click()
    await expect(page.getByTestId('dat-heading')).toHaveText(
      'Dehydrate All True',
    )
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )
  })
})

test.describe('transport flags - round trip', () => {
  for (const route of routes) {
    test(`${route.path}: context memoized, beforeLoad and loader re-run`, async ({
      page,
    }) => {
      await page.goto(route.path)
      await awaitHydrated(page)
      await expectValues(page, route, expected(route, 'ssr'))

      await page.getByTestId('link-home').click()
      await expect(page.getByTestId('index-heading')).toHaveText('Home')

      await page.getByTestId(`link-${route.path.slice(1)}`).click()
      await expect(page.getByTestId(`${route.prefix}-heading`)).toHaveText(
        route.heading,
      )
      await expectValues(page, route, expected(route, 'roundTrip'))
    })
  }
})
