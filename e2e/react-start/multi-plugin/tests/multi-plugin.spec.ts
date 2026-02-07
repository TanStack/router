import { expect, test } from '@playwright/test'

test('both plugins contribute context on initial SSR load', async ({
  page,
}) => {
  await page.goto('/')

  // Verify context-bridge plugin contributed its values
  const serverContextText = await page
    .getByTestId('server-context')
    .textContent()
  const serverContext = JSON.parse(serverContextText || '{}')

  expect(serverContext).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })

  // queryClient should be present in context (it's a class instance so won't
  // appear in sortJson output, but the key should exist in the router context)
  const routerContextText = await page
    .getByTestId('router-context')
    .textContent()
  const routerContext = JSON.parse(routerContextText || '{}')
  expect(routerContext.context).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })
  // 'b' should NOT be present (not selected in the bridge)
  expect(routerContext.context.b).toBeUndefined()

  // Verify global start context has all middleware values
  const globalStartContextText = await page
    .getByTestId('global-start-context')
    .textContent()
  const globalStartContext = JSON.parse(globalStartContextText || '{}')
  expect(globalStartContext).toMatchObject({
    a: 'a-from-mwA',
    b: 'b-from-mwB',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
  })
})

test('query plugin provides queryClient in context for data fetching', async ({
  page,
}) => {
  await page.goto('/query-test')

  // The query-test route uses ensureQueryData via context.queryClient,
  // meaning the SSR query plugin successfully contributed queryClient
  const queryDataText = await page.getByTestId('query-data').textContent()
  const queryData = JSON.parse(queryDataText || '{}')

  expect(queryData).toHaveProperty('message', 'Hello from server!')
  expect(queryData).toHaveProperty('timestamp')

  // queryClient is available in router context
  const queryClientAvailable = await page
    .getByTestId('query-client-available')
    .textContent()
  expect(queryClientAvailable?.trim()).toBe('true')

  // Bridged context values should also be present on this page
  const routerContextText = await page
    .getByTestId('router-context-query')
    .textContent()
  const routerContext = JSON.parse(routerContextText || '{}')
  expect(routerContext.context).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })
})

test('navigating between pages preserves both plugins context', async ({
  page,
}) => {
  await page.goto('/')

  // Navigate to query-test via client-side navigation
  await page.getByTestId('to-query-test').click()
  await page.waitForURL('/query-test')

  // Query data should load
  const queryDataText = await page.getByTestId('query-data').textContent()
  const queryData = JSON.parse(queryDataText || '{}')
  expect(queryData).toHaveProperty('message', 'Hello from server!')

  // Bridged context still present
  const routerContextText = await page
    .getByTestId('router-context-query')
    .textContent()
  const routerContext = JSON.parse(routerContextText || '{}')
  expect(routerContext.context).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })

  // queryClient available
  const queryClientAvailable = await page
    .getByTestId('query-client-available')
    .textContent()
  expect(queryClientAvailable?.trim()).toBe('true')
})
