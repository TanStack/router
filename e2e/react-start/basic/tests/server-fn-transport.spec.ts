import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('lazy codec stays deferred and overlaps concurrent payload-free RPCs', async ({
  page,
}) => {
  test.skip(process.env.E2E_SERVER_FN_TRANSPORT !== 'lazy')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requests: Array<string> = []
  page.on('request', (request) => {
    requests.push(request.url())
  })
  await page.route('**/serverFnCodec-*.js', async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/raw-stream/client-call')
  await expect(page.getByTestId('test1-btn')).toBeVisible()
  await page.waitForTimeout(1000)
  const codecRequests = () =>
    requests.filter((url) => /\/serverFnCodec-[^/]+\.js/.test(url))
  expect(codecRequests()).toHaveLength(0)
  try {
    const rpc = page.waitForRequest(
      (request) => request.headers()['x-tsr-serverfn'] === 'true',
    )
    await page.getByTestId('test1-btn').click()
    await page.getByTestId('test2-btn').click()
    await rpc
    await expect.poll(() => codecRequests().length).toBe(1)
    await expect(page.getByTestId('test1-result')).toBeHidden()
  } finally {
    release()
  }
  await expect(page.getByTestId('test1-result')).toContainText(
    'chunk1chunk2chunk3',
  )
  await expect(page.getByTestId('test2-result')).toContainText(
    'stream1-astream1-b',
  )
  expect(codecRequests()).toHaveLength(1)
})
