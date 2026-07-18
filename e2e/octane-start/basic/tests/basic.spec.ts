import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('renders a full Start document and hydrates Octane', async ({
  page,
  request,
}) => {
  const hydrationErrors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      hydrationErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => hydrationErrors.push(error.message))

  const response = await request.get('/?probe=document')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('<!DOCTYPE html>')
  expect(html).toContain('<html lang="en">')
  expect(html).toContain('id="__app"')
  expect(html).toContain('Octane + TanStack Start')
  expect(html).toContain('loader ran on server')

  await page.goto('/?probe=hydrate')
  await expect(page).toHaveTitle('Octane Start E2E')
  await expect(page.locator('#__app')).toHaveCount(1)
  await expect(page.locator('#__app nav')).toHaveCount(1)
  await expect(page.locator('#__app main')).toHaveCount(1)
  await expect(page.getByTestId('loader-run')).toHaveText(
    'loader ran on server 1',
  )
  await expect(page.getByTestId('date-value')).toHaveText(
    '2026-07-16T12:34:56.000Z',
  )
  await expect(page.getByTestId('map-value')).toHaveText('octane start')

  await page.getByTestId('counter').click()
  await expect(page.getByTestId('counter')).toHaveText('count 1')
  expect(hydrationErrors).toEqual([])
})

test('navigates without replacing the document', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByTestId('about-heading')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => performance.getEntriesByType('navigation').length),
    )
    .toBe(1)
})

test('streams deferred values through the Start serializer', async ({
  page,
}) => {
  await page.goto('/deferred')
  await expect(page.getByTestId('deferred-value')).toHaveCount(1)
  await expect(page.getByTestId('deferred-value')).toHaveText(
    '2026-07-16T22:00:00.000Z streamed',
  )
})

test('round-trips typed values through a server function', async ({ page }) => {
  await page.goto('/server-function')

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/_serverFn/') &&
      response.request().method() === 'POST',
  )
  await page.getByTestId('call-server-function').click()

  const response = await responsePromise
  expect(response.status()).toBe(200)
  await expect(page.getByTestId('server-function-result')).toHaveText(
    '2026-07-17T12:00:01.000Z octane server',
  )
})

test('flushes the deferred fallback before the value resolves', async ({
  baseURL,
}) => {
  const response = await fetch(`${baseURL}/deferred?probe=stream`, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36',
    },
  })
  expect(response.status).toBe(200)
  expect(response.body).not.toBeNull()

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let shell = ''

  const shellResult = await Promise.race([
    (async () => {
      while (!shell.includes('deferred-pending')) {
        const result = await reader.read()
        if (result.done) {
          throw new Error('The response ended before the deferred fallback')
        }
        shell += decoder.decode(result.value, { stream: true })
      }
      return shell
    })(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('The deferred fallback was not flushed promptly'))
      }, 500)
    }),
  ])

  expect(shellResult).not.toContain('2026-07-16T22:00:00.000Z streamed')

  let tail = ''
  while (true) {
    const result = await reader.read()
    if (result.done) {
      tail += decoder.decode()
      break
    }
    tail += decoder.decode(result.value, { stream: true })
  }

  expect(shellResult + tail).toContain('2026-07-16T22:00:00.000Z streamed')
})

test('routes deferred rejections through the route error boundary', async ({
  page,
}) => {
  await page.goto('/deferred-error')
  await expect(page.getByTestId('route-error')).toContainText('deferred boom')
})

test('preserves redirect and not-found response status', async ({
  request,
}) => {
  const redirectResponse = await request.get('/redirect', {
    maxRedirects: 0,
  })
  expect([301, 302, 307, 308]).toContain(redirectResponse.status())
  expect(redirectResponse.headers().location).toBe('/about')

  const missingResponse = await request.get('/missing')
  expect(missingResponse.status()).toBe(404)
  expect(await missingResponse.text()).toContain('Not found')
})
