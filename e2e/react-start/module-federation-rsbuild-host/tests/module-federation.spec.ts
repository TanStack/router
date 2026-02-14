import { expect } from '@playwright/test'
import { getTestServerPort, test } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

const REMOTE_PORT = await getTestServerPort(`${packageJson.name}-remote`)
const REMOTE_ORIGIN = `http://localhost:${REMOTE_PORT}`
const HOST_MODE = process.env.HOST_MODE || 'ssr'

test('renders the remote module on the SSR response', async ({ page }) => {
  const response = await page.request.get('/')
  expect(response.ok()).toBeTruthy()

  const html = await response.text()
  if (HOST_MODE === 'ssr') {
    expect(html).toContain('Federated message from remote')
  } else {
    expect(html).not.toContain('Federated message from remote')
  }
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

  if (HOST_MODE === 'ssr') {
    await expect(page.getByTestId('federated-button')).toContainText(
      'Federated message from remote',
    )
  } else {
    await expect(page.getByTestId('federated-placeholder')).toContainText(
      'Federated message renders on the client in this mode.',
    )
  }
})

test('serves node-compatible remote SSR manifest metadata', async ({ page }) => {
  const response = await page.request.get(`${REMOTE_ORIGIN}/ssr/mf-manifest.json`)
  expect(response.ok()).toBeTruthy()

  const manifest = await response.json()
  expect(manifest?.metaData?.remoteEntry?.type).toBe('commonjs-module')

  const sharedByName = new Map(
    (manifest?.shared ?? []).map((shared: any) => [shared.name, shared]),
  )

  const reactShared = sharedByName.get('react')
  const reactDomShared = sharedByName.get('react-dom')

  expect(reactShared?.assets?.js?.sync ?? []).toEqual([])
  expect(reactDomShared?.assets?.js?.sync ?? []).toEqual([])
})

test('dynamically registers and renders remote routes', async ({ page }) => {
  test.skip(
    HOST_MODE !== 'ssr',
    'Dynamic route registration is validated in SSR mode.',
  )

  const response = await page.request.get('/dynamic-remote')
  expect(response.ok()).toBeTruthy()
  const html = await response.text()
  expect(html).toContain('Dynamic remote page from federation')

  await page.goto('/dynamic-remote')
  await expect(page.getByTestId('dynamic-remote-heading')).toContainText(
    'Dynamic remote page from federation',
  )
})

test('does not SSR selective client-only route content', async ({ page }) => {
  test.skip(
    HOST_MODE === 'prerender',
    'Prerender mode serves selective route via static redirect semantics.',
  )

  const response = await page.request.get('/selective-client-only')
  expect(response.ok()).toBeTruthy()

  const html = await response.text()
  expect(html).not.toContain('Selective remote route content')
})

test('loads federated server route data', async ({ page }) => {
  test.skip(
    HOST_MODE !== 'ssr',
    'Server federation runtime is only enabled for SSR mode.',
  )

  const response = await page.request.get('/api/federated-data')
  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  expect(json).toEqual({
    source: 'server-route',
    message: 'Federated server data from remote',
  })
})

test('loads federated server function data', async ({ page }) => {
  test.skip(
    HOST_MODE !== 'ssr',
    'Server federation runtime is only enabled for SSR mode.',
  )

  await page.goto('/server-fn-mf')
  await expect(page.getByTestId('server-fn-result')).toContainText(
    '"source":"server-function"',
  )
  await expect(page.getByTestId('server-fn-result')).toContainText(
    '"message":"Federated server data from remote"',
  )
})
