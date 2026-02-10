import { expect } from '@playwright/test'
import { getTestServerPort, test } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

const REMOTE_PORT = await getTestServerPort(`${packageJson.name}-remote`)
const REMOTE_ORIGIN = `http://localhost:${REMOTE_PORT}`

test('renders the remote module on the SSR response', async ({ page }) => {
  const response = await page.request.get('/')
  expect(response.ok()).toBeTruthy()

  const html = await response.text()
  expect(html).toContain('Federated message from remote')
})

test('loads remote entry over http at runtime', async ({
  page,
}) => {
  const remoteRequests: Array<string> = []

  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(REMOTE_ORIGIN)) {
      return
    }
    if (url.endsWith('.js')) {
      remoteRequests.push(url)
    }
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  expect(
    remoteRequests.some(
      (url) => url.includes('/remoteEntry.js') || url.includes('/dist/remoteEntry.js'),
    ),
  ).toBeTruthy()

  await expect(page.getByTestId('federated-button')).toContainText(
    'Federated message from remote',
  )
})
