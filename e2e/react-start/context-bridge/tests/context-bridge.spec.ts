import { expect, test } from '@playwright/test'

test('bridges selected request context into router context', async ({
  page,
}) => {
  await page.goto('/')

  const routerContextText = await page
    .getByTestId('server-context')
    .textContent()
  const routerContext = JSON.parse(routerContextText || '{}')

  // Router beforeLoad context is router context (selected + isomorphic), not full request ctx
  expect(routerContext).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })

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

  const bridgedText = await page.getByTestId('bridged-context').textContent()
  const bridged = JSON.parse(bridgedText || '{}')
  expect(bridged.context).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })
  expect(bridged.context.b).toBeUndefined()

  await page.getByTestId('to-next').click()
  await page.waitForURL('/next')

  const bridgedNextText = await page
    .getByTestId('bridged-context-next')
    .textContent()
  const bridgedNext = JSON.parse(bridgedNextText || '{}')
  expect(bridgedNext.context).toMatchObject({
    a: 'a-from-mwA',
    c: 'c-from-mwC',
    shared: 'shared-from-mwB',
    static: 'static-value',
  })
  expect(bridgedNext.context.b).toBeUndefined()
})
