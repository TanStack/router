import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated, hydrationPayload, readClientRuns } from './utils'

// ============================================================================
// Cached auth context (dehydrate: true, revalidate: true, beforeLoad guard)
// ============================================================================
test.describe('use case - cached auth context', () => {
  test('SSR: restored from the payload, not re-run at hydration, re-run on invalidate', async ({
    page,
  }) => {
    const response = await page.goto('/cached-auth/alice')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    expect(html).toContain('guarded-alice')

    await awaitHydrated(page)
    await expect(page.getByTestId('auth-session-user')).toHaveText('alice')
    // the session came from the server and was restored from the payload
    await expect(page.getByTestId('auth-session-origin')).toHaveText('server')
    // the handler did not run a second time during hydration
    await expect(page.getByTestId('auth-client-runs')).toHaveText('0')
    expect((await readClientRuns(page))['auth-context']).toBeUndefined()
    await expect(page.getByTestId('auth-guard')).toHaveText('guarded-alice')
    await expect(page.getByTestId('auth-loader-origin')).toHaveText('server')

    // router.invalidate() re-runs the context handler (revalidate: true)
    await page.getByTestId('auth-invalidate-btn').click()
    await expect(page.getByTestId('auth-session-origin')).toHaveText('client')
    await expect(page.getByTestId('auth-client-runs')).toHaveText('1')
    await expect(page.getByTestId('auth-loader-origin')).toHaveText('client')
    await expect(page.getByTestId('auth-guard')).toHaveText('guarded-alice')
    expect((await readClientRuns(page))['auth-context']).toBe(1)

    // a second invalidate runs it again
    await page.getByTestId('auth-invalidate-btn').click()
    await expect(page.getByTestId('auth-client-runs')).toHaveText('2')
  })

  test('SSR: the beforeLoad guard redirects when there is no session', async ({
    page,
  }) => {
    await page.goto('/cached-auth/nobody')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
  })

  test('client nav: runs once in the browser, is memoized across navigations', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)

    await page.getByTestId('link-cached-auth-alice').click()
    await expect(page.getByTestId('auth-heading')).toHaveText(
      'Cached auth context',
    )
    await expect(page.getByTestId('auth-session-origin')).toHaveText('client')
    await expect(page.getByTestId('auth-client-runs')).toHaveText('1')

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-cached-auth-alice').click()
    await expect(page.getByTestId('auth-heading')).toHaveText(
      'Cached auth context',
    )
    // context is cached per match: no re-run without invalidate
    await expect(page.getByTestId('auth-client-runs')).toHaveText('1')

    await page.getByTestId('auth-invalidate-btn').click()
    await expect(page.getByTestId('auth-client-runs')).toHaveText('2')
  })

  test('client nav: the guard redirects when there is no session', async ({
    page,
  }) => {
    await page.goto('/posts')
    await awaitHydrated(page)
    await page.getByTestId('link-cached-auth-nobody').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
  })
})

// ============================================================================
// Query options in context (function form, not transported, memoized)
// ============================================================================
test.describe('use case - query options in context', () => {
  test('SSR: recomputed on the client at hydration, stable across invalidate', async ({
    page,
  }) => {
    const response = await page.goto('/query-context/1')
    const html = await response!.text()
    expect(html).toContain('First Post')

    await awaitHydrated(page)
    await expect(page.getByTestId('query-post-title')).toHaveText('First Post')
    // the loader was transported
    await expect(page.getByTestId('query-loader-origin')).toHaveText('server')
    await expect(page.getByTestId('query-loader-instance')).toHaveText('0')
    // the context was not: the client computed it once during hydration
    await expect(page.getByTestId('query-context-origin')).toHaveText('client')
    await expect(page.getByTestId('query-context-instance')).toHaveText('1')
    await expect(page.getByTestId('query-fn-type')).toHaveText('function')
    await expect(page.getByTestId('query-key')).toHaveText('post/1')

    // invalidate re-runs the loader but keeps the context contribution
    await page.getByTestId('query-invalidate-btn').click()
    await expect(page.getByTestId('query-loader-origin')).toHaveText('client')
    await expect(page.getByTestId('query-loader-instance')).toHaveText('1')
    await expect(page.getByTestId('query-context-instance')).toHaveText('1')
    expect((await readClientRuns(page))['query-context']).toBe(1)
  })

  test('client nav: computed once in the browser', async ({ page }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-query-context').click()
    await expect(page.getByTestId('query-post-title')).toHaveText('First Post')
    await expect(page.getByTestId('query-context-origin')).toHaveText('client')
    await expect(page.getByTestId('query-context-instance')).toHaveText('1')
    await expect(page.getByTestId('query-loader-origin')).toHaveText('client')

    await page.getByTestId('query-invalidate-btn').click()
    await expect(page.getByTestId('query-loader-instance')).toHaveText('2')
    await expect(page.getByTestId('query-context-instance')).toHaveText('1')
  })
})

// ============================================================================
// A revalidate fn with prev keeps one field stable, refreshes another
// ============================================================================
test.describe('use case - revalidate with prev', () => {
  test('SSR: first prev is the restored server value', async ({ page }) => {
    await page.goto('/revalidate-fn')
    await awaitHydrated(page)
    await expect(page.getByTestId('revalidate-origin')).toHaveText('server')
    await expect(page.getByTestId('revalidate-stable-token')).toHaveText(
      'stable-server',
    )
    await expect(page.getByTestId('revalidate-auth-status')).toHaveText('1')
    await expect(page.getByTestId('revalidate-runs')).toHaveText('0')
    await expect(page.getByTestId('revalidate-beforeLoad')).toHaveText(
      'revalidate-beforeLoad',
    )
    await expect(page.getByTestId('revalidate-loader')).toHaveText(
      'revalidate-loader',
    )

    await page.getByTestId('revalidate-invalidate-btn').click()
    await expect(page.getByTestId('revalidate-runs')).toHaveText('1')
    await expect(page.getByTestId('revalidate-origin')).toHaveText('client')
    // kept from prev, which was the value restored from the payload
    await expect(page.getByTestId('revalidate-stable-token')).toHaveText(
      'stable-server',
    )
    await expect(page.getByTestId('revalidate-auth-status')).toHaveText('2')

    await page.getByTestId('revalidate-invalidate-btn').click()
    await expect(page.getByTestId('revalidate-runs')).toHaveText('2')
    await expect(page.getByTestId('revalidate-stable-token')).toHaveText(
      'stable-server',
    )
    await expect(page.getByTestId('revalidate-auth-status')).toHaveText('3')
    const runs = await readClientRuns(page)
    expect(runs['revalidate']).toBe(2)
  })

  test('client nav: handler first, then revalidate with prev', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-revalidate-fn').click()
    await expect(page.getByTestId('revalidate-heading')).toHaveText(
      'Revalidate fn',
    )
    await expect(page.getByTestId('revalidate-origin')).toHaveText('client')
    await expect(page.getByTestId('revalidate-stable-token')).toHaveText(
      'stable-client-1',
    )
    await expect(page.getByTestId('revalidate-auth-status')).toHaveText('1')
    await expect(page.getByTestId('revalidate-runs')).toHaveText('0')

    await page.getByTestId('revalidate-invalidate-btn').click()
    await expect(page.getByTestId('revalidate-runs')).toHaveText('1')
    await expect(page.getByTestId('revalidate-stable-token')).toHaveText(
      'stable-client-1',
    )
    await expect(page.getByTestId('revalidate-auth-status')).toHaveText('2')
  })
})

// ============================================================================
// Dehydrate-partial: hydrate reconstructs with ctx (params, context)
// ============================================================================
test.describe('use case - dehydrate-partial reconstruction with ctx', () => {
  test('SSR: serializable fields from the server, the rest rebuilt by hydrate using ctx', async ({
    page,
  }) => {
    await page.goto('/dehydrate-partial/de-DE')
    await awaitHydrated(page)
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    await expect(page.getByTestId('dp-context-label')).toHaveText('server-ctx')
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('server-bl')
    await expect(page.getByTestId('dp-loader-title')).toHaveText('server-ldr')
    await expect(page.getByTestId('dp-beforeLoad-count')).toHaveText('42')

    await expect(page.getByTestId('dp-context-date')).toHaveText(
      '2024-03-15T12:00:00.000Z',
    )
    await expect(page.getByTestId('dp-context-date-type')).toHaveText('Date')

    // hydrate used the parent context (root-context) and the wire label
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx|root-context] test',
    )
    await expect(page.getByTestId('dp-context-format-type')).toHaveText(
      'function',
    )
    // hydrate rebuilt the formatter from params.locale
    await expect(page.getByTestId('dp-context-currency-locale')).toHaveText(
      'de-DE',
    )
    await expect(page.getByTestId('dp-context-currency')).toContainText(
      '1.234,50',
    )

    await expect(page.getByTestId('dp-beforeLoad-pattern')).toHaveText(
      '^hello-\\d+$',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-type')).toHaveText(
      'RegExp',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-test')).toHaveText(
      'true',
    )
    // beforeLoad.hydrate saw the route's own hydrated context contribution
    await expect(page.getByTestId('dp-beforeLoad-describe')).toHaveText(
      'server-ctx:server-bl:hydrated',
    )

    await expect(page.getByTestId('dp-loader-scores')).toHaveText('10,20,30')
    await expect(page.getByTestId('dp-loader-avg')).toHaveText('20')
    await expect(page.getByTestId('dp-loader-avg-type')).toHaveText('function')
    // loader.hydrate saw the hydrated beforeLoad contribution
    await expect(page.getByTestId('dp-loader-summary')).toHaveText(
      'server-bl/3:hydrated',
    )
  })

  test('client nav: handlers run locally, nothing goes through hydrate', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-dehydrate-partial').click()
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    await expect(page.getByTestId('dp-context-label')).toHaveText('client-ctx')
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('client-bl')
    await expect(page.getByTestId('dp-loader-title')).toHaveText('client-ldr')
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[client-ctx] test',
    )
    await expect(page.getByTestId('dp-context-currency-locale')).toHaveText(
      'de-DE',
    )
    await expect(page.getByTestId('dp-beforeLoad-describe')).toHaveText(
      'client-ctx:client-bl',
    )
    await expect(page.getByTestId('dp-loader-summary')).toHaveText(
      'client-bl/3',
    )
    await expect(page.getByTestId('dp-context-date-type')).toHaveText('Date')
    await expect(page.getByTestId('dp-beforeLoad-pattern-test')).toHaveText(
      'true',
    )
    await expect(page.getByTestId('dp-loader-avg')).toHaveText('20')
  })

  test('round trip: context keeps its hydrated value, beforeLoad and loader re-run', async ({
    page,
  }) => {
    await page.goto('/dehydrate-partial/de-DE')
    await awaitHydrated(page)
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx|root-context] test',
    )

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-dehydrate-partial').click()
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    await expect(page.getByTestId('dp-context-label')).toHaveText('server-ctx')
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx|root-context] test',
    )
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('client-bl')
    await expect(page.getByTestId('dp-beforeLoad-describe')).toHaveText(
      'server-ctx:client-bl',
    )
    await expect(page.getByTestId('dp-loader-title')).toHaveText('client-ldr')
    await expect(page.getByTestId('dp-loader-summary')).toHaveText(
      'client-bl/3',
    )
  })
})

// ============================================================================
// dehydrate: true + hydrate on the full value, client-only field declared
// in the handler as `undefined`
// ============================================================================
test.describe('use case - reconstruct from the full value', () => {
  test('SSR: the report is transported, hydrate fills the time zone in the browser', async ({
    page,
  }) => {
    const response = await page.goto('/full-value')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    // data-only: the component is not in the HTML, the value is in the payload
    expect(html).not.toContain('data-testid="full-value-component"')
    expect(hydrationPayload(html)).toContain('server-full-value-report')
    expect(html).not.toContain('client-full-value-report')

    await awaitHydrated(page)
    await expect(page.getByTestId('full-value-heading')).toHaveText(
      'Full value',
    )
    await expect(page.getByTestId('full-value-report-title')).toHaveText(
      'Quarterly report',
    )
    await expect(page.getByTestId('full-value-report-source')).toHaveText(
      'server-full-value-report',
    )
    const browserTimeZone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
    expect(browserTimeZone).not.toBe('')
    await expect(page.getByTestId('full-value-time-zone')).toHaveText(
      browserTimeZone,
    )
    await expect(page.getByTestId('full-value-time-zone-type')).toHaveText(
      'string',
    )
  })

  test('client nav: the handler runs in the browser, the time zone stays undefined', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-full-value').click()
    await expect(page.getByTestId('full-value-heading')).toHaveText(
      'Full value',
    )
    await expect(page.getByTestId('full-value-report-source')).toHaveText(
      'client-full-value-report',
    )
    await expect(page.getByTestId('full-value-time-zone')).toHaveText(
      'undefined',
    )
    await expect(page.getByTestId('full-value-time-zone-type')).toHaveText(
      'undefined',
    )
  })

  test('round trip after SSR: the loader re-runs locally and loses the hydrated time zone', async ({
    page,
  }) => {
    await page.goto('/full-value')
    await awaitHydrated(page)
    await expect(page.getByTestId('full-value-time-zone-type')).toHaveText(
      'string',
    )

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-full-value').click()
    await expect(page.getByTestId('full-value-heading')).toHaveText(
      'Full value',
    )
    await expect(page.getByTestId('full-value-report-source')).toHaveText(
      'client-full-value-report',
    )
    await expect(page.getByTestId('full-value-time-zone')).toHaveText(
      'undefined',
    )
  })
})

// ============================================================================
// `hydrate` returns a different shape, the component narrows on a literal
// discriminant written on both sides
// ============================================================================
test.describe('use case - hydrated narrowing', () => {
  test('SSR: hydrate adds client-only prefs to the transported stats', async ({
    page,
  }) => {
    const response = await page.goto('/hydrated-narrowing')
    const html = await response!.text()
    // the wire carries only what dehydrate kept
    expect(hydrationPayload(html)).toContain('visits:42')
    expect(hydrationPayload(html)).not.toContain('prefs')

    await awaitHydrated(page)
    await expect(page.getByTestId('narrowing-heading')).toHaveText(
      'Hydrated narrowing',
    )
    await expect(page.getByTestId('narrowing-hydrated')).toHaveText('true')
    // stats were shipped from the server
    await expect(page.getByTestId('narrowing-stats-origin')).toHaveText(
      'server',
    )
    await expect(page.getByTestId('narrowing-stats-visits')).toHaveText('42')
    // prefs were read in the browser by hydrate
    await expect(page.getByTestId('narrowing-prefs')).toHaveText('light')
  })

  test('client nav: the handler runs in the browser, the component sees the hydrated: false branch', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-hydrated-narrowing').click()
    await expect(page.getByTestId('narrowing-heading')).toHaveText(
      'Hydrated narrowing',
    )
    await expect(page.getByTestId('narrowing-hydrated')).toHaveText('false')
    await expect(page.getByTestId('narrowing-stats-origin')).toHaveText(
      'client',
    )
    await expect(page.getByTestId('narrowing-stats-visits')).toHaveText('43')
    // the handler does not produce prefs; only hydrate does
    await expect(page.getByTestId('narrowing-prefs')).toHaveText('no-prefs')
  })

  test('round trip after SSR: hydrated data is replaced by a client loader run', async ({
    page,
  }) => {
    await page.goto('/hydrated-narrowing')
    await awaitHydrated(page)
    await expect(page.getByTestId('narrowing-hydrated')).toHaveText('true')
    await expect(page.getByTestId('narrowing-prefs')).toHaveText('light')

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-hydrated-narrowing').click()
    await expect(page.getByTestId('narrowing-heading')).toHaveText(
      'Hydrated narrowing',
    )
    await expect(page.getByTestId('narrowing-hydrated')).toHaveText('false')
    await expect(page.getByTestId('narrowing-stats-origin')).toHaveText(
      'client',
    )
    await expect(page.getByTestId('narrowing-prefs')).toHaveText('no-prefs')
  })
})
