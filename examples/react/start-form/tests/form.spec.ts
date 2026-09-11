import { expect, test } from '@playwright/test'
let browserErrors: Array<string> = []
test.beforeEach(({ page }) => {
  browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Invalid hook call')
    ) {
      browserErrors.push(message.text())
    }
  })
})
test.afterEach(() => {
  expect(browserErrors).toEqual([])
})

test('server field errors, pending preview, persistence, redirect and CSRF', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByLabel('Your goal').fill('   ')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a reading goal.')
  await expect(
    page.getByText('Current goal: Read one chapter', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Your goal').fill('x'.repeat(81))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Use 80 characters or fewer.',
  )
  await page.getByLabel('Your goal').fill('Read two chapters')
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      await gate
    }
    await route.continue()
  })
  const submitted = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      new URL(r.url()).pathname.startsWith('/_serverFn/'),
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const write = await submitted
  try {
    await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Save and continue' }),
    ).toBeDisabled()
    await expect(
      page.getByText('Current goal: Read two chapters', { exact: true }),
    ).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByRole('status')).toHaveText('Saved.')
  await page.unroute('**/_serverFn/**')
  await page.reload()
  await expect(page.getByLabel('Your goal')).toHaveValue('Read two chapters')
  expect(await (await request.get('/')).text()).toContain('Read one chapter')
  const headers = await write.allHeaders()
  delete headers.cookie
  delete headers['content-length']
  const crossSite = await page.request.post(write.url(), {
    headers: {
      ...headers,
      origin: 'https://untrusted.example',
      'sec-fetch-site': 'cross-site',
    },
    data: write.postData() ?? '',
  })
  expect(crossSite.status()).toBe(403)
  await page.getByLabel('Your goal').fill('Finish a book')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/saved$/)
  await expect(page.getByText('Finish a book', { exact: true })).toBeVisible()
  const response = await page.reload()
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.getByText('Finish a book', { exact: true })).toBeVisible()
})

test('HTTP failure rolls back the preview, preserves input, and permits retry', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Your goal').fill('A new goal')
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":"test server failure"}',
      })
    } else {
      await route.continue()
    }
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Could not confirm the save. Reload to check your saved goal.',
  )
  await expect(
    page.getByText('Current goal: Read one chapter', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Your goal')).toHaveValue('A new goal')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled()
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  await page.reload()
  await expect(page.getByLabel('Your goal')).toHaveValue('A new goal')
})
