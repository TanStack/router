import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getTestServerPort, test } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

const REMOTE_PORT = await getTestServerPort(`${packageJson.name}-remote`)
const REMOTE_ORIGIN = `http://localhost:${REMOTE_PORT}`
const HOST_MODE = process.env.HOST_MODE || 'ssr'

type SharedAssetGroup = {
  sync?: Array<string>
}

type ManifestSharedEntry = {
  name?: string
  version?: string
  requiredVersion?: string
  fallback?: string
  assets?: {
    js?: SharedAssetGroup
  }
}

type ManifestExposeEntry = {
  id?: string
  name?: string
  path?: string
  assets?: {
    js?: SharedAssetGroup
  }
}

type ManifestRemoteEntryMetadata = {
  type?: string
  name?: string
  path?: string
}

type ManifestTypesMetadata = {
  zip?: string
  api?: string
}

type MfManifest = {
  metaData?: {
    remoteEntry?: ManifestRemoteEntryMetadata
    publicPath?: string
    types?: ManifestTypesMetadata
  }
  shared?: Array<ManifestSharedEntry>
  exposes?: Array<ManifestExposeEntry>
  remotes?: Array<unknown>
}

async function fetchManifest(
  page: Page,
  paths: Array<string>,
): Promise<MfManifest> {
  for (const path of paths) {
    const response = await page.request.get(`${REMOTE_ORIGIN}${path}`)
    if (!response.ok()) {
      continue
    }

    const body = await response.text()
    if (!body.trim().startsWith('{')) {
      continue
    }

    return JSON.parse(body) as MfManifest
  }

  throw new Error(
    `Could not load JSON manifest from any path: ${paths.join(', ')}`,
  )
}

function getSharedByName(manifest: MfManifest) {
  return new Map(
    (manifest.shared ?? []).map((shared) => [shared.name, shared] as const),
  )
}

function getExposesByName(manifest: MfManifest) {
  return new Map(
    (manifest.exposes ?? []).map((expose) => [expose.name, expose] as const),
  )
}

function assertRelativeJsAssetPaths(assetPaths: Array<string>) {
  for (const assetPath of assetPaths) {
    expect(assetPath.startsWith('static/js/')).toBeTruthy()
    expect(assetPath.startsWith('/')).toBeFalsy()
    expect(assetPath.includes('file://')).toBeFalsy()
    expect(assetPath.includes('/workspace/')).toBeFalsy()
  }
}

function assertRemoteEntryMeta(
  manifest: MfManifest,
  expectedType: 'global' | 'commonjs-module',
  expectedPublicPath: string,
) {
  expect(manifest?.metaData?.remoteEntry?.type).toBe(expectedType)
  expect(manifest?.metaData?.remoteEntry?.name).toBe('remoteEntry.js')
  expect(manifest?.metaData?.remoteEntry?.path).toBe('')
  expect(manifest?.metaData?.publicPath).toBe(expectedPublicPath)
}

async function assertAssetServedAsJavaScript(
  page: Page,
  basePath: '/dist' | '/ssr',
  assetPath: string,
) {
  const response = await page.request.get(`${REMOTE_ORIGIN}${basePath}/${assetPath}`)
  expect(response.ok()).toBeTruthy()

  const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
  expect(contentType).not.toBe('')
  expect(contentType.includes('text/html')).toBeFalsy()
  expect(contentType.includes('javascript')).toBeTruthy()

  const body = await response.text()
  expect(body.startsWith('<!doctype html>')).toBeFalsy()
}

async function assertExposeContracts(
  page: Page,
  manifest: MfManifest,
  basePath: '/dist' | '/ssr',
) {
  const expectedExposePaths = {
    message: './message',
    routes: './routes',
    'server-data': './server-data',
  } as const

  const exposesByName = getExposesByName(manifest)
  expect(exposesByName.size).toBe(Object.keys(expectedExposePaths).length)
  for (const [exposeName, expectedPath] of Object.entries(expectedExposePaths)) {
    const exposeEntry = exposesByName.get(exposeName)
    expect(exposeEntry).toBeDefined()
    expect(exposeEntry?.path).toBe(expectedPath)
    expect(exposeEntry?.id).toBe(`mf_remote:${exposeName}`)

    const exposeSyncAssets = exposeEntry?.assets?.js?.sync ?? []
    expect(exposeSyncAssets.length).toBeGreaterThan(0)
    assertRelativeJsAssetPaths(exposeSyncAssets)
    await assertAssetServedAsJavaScript(page, basePath, exposeSyncAssets[0]!)
  }
}

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

test('serves remote entries as javascript over HTTP', async ({ page }) => {
  for (const remoteEntryPath of ['/dist/remoteEntry.js', '/ssr/remoteEntry.js']) {
    const response = await page.request.get(`${REMOTE_ORIGIN}${remoteEntryPath}`)
    expect(response.ok()).toBeTruthy()

    const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
    expect(contentType).not.toBe('')
    expect(contentType.includes('text/html')).toBeFalsy()
    expect(contentType.includes('javascript')).toBeTruthy()

    const body = await response.text()
    expect(body.startsWith('<!doctype html>')).toBeFalsy()
    expect(body.includes('mf_remote')).toBeTruthy()
  }
})

test('serves browser federated types zip over HTTP', async ({ page }) => {
  const manifest = await fetchManifest(page, [
    '/mf-manifest.json',
    '/dist/mf-manifest.json',
  ])
  const typesZip = manifest?.metaData?.types?.zip
  expect(typesZip).toBeDefined()
  expect(typesZip?.startsWith('@')).toBeTruthy()

  const response = await page.request.get(`${REMOTE_ORIGIN}/dist/${typesZip}`)
  expect(response.ok()).toBeTruthy()

  const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
  expect(contentType).not.toBe('')
  expect(contentType.includes('text/html')).toBeFalsy()

  const body = await response.body()
  expect(body.length).toBeGreaterThan(0)
})

test('serves node-compatible remote SSR manifest metadata', async ({ page }) => {
  const manifest = await fetchManifest(page, ['/ssr/mf-manifest.json'])
  assertRemoteEntryMeta(manifest, 'commonjs-module', `${REMOTE_ORIGIN}/ssr/`)
  expect(manifest?.metaData?.types?.zip).toBe('')
  expect(manifest?.metaData?.types?.api).toBe('')

  const sharedByName = getSharedByName(manifest)
  expect(sharedByName.size).toBe(2)
  expect(manifest.remotes ?? []).toEqual([])
  const reactShared = sharedByName.get('react')
  const reactDomShared = sharedByName.get('react-dom')

  expect(reactShared).toBeDefined()
  expect(reactDomShared).toBeDefined()
  expect(reactShared?.version).toBe('*')
  expect(reactShared?.requiredVersion).toBe('^*')
  expect(reactDomShared?.version).toBe('*')
  expect(reactDomShared?.requiredVersion).toBe('^*')
  expect(reactShared?.fallback).toBe('')
  expect(reactDomShared?.fallback).toBe('')
  expect(reactShared?.assets?.js?.sync ?? []).toEqual([])
  expect(reactDomShared?.assets?.js?.sync ?? []).toEqual([])

  await assertExposeContracts(page, manifest, '/ssr')
})

test('serves browser manifest with shared fallback assets', async ({ page }) => {
  const manifest = await fetchManifest(page, [
    '/mf-manifest.json',
    '/dist/mf-manifest.json',
  ])
  assertRemoteEntryMeta(manifest, 'global', `${REMOTE_ORIGIN}/`)
  expect(manifest?.metaData?.types?.zip).toBe('@mf-types.zip')
  expect(manifest?.metaData?.types?.api).toBe('@mf-types.d.ts')

  const sharedByName = getSharedByName(manifest)
  expect(sharedByName.size).toBe(2)
  expect(manifest.remotes ?? []).toEqual([])
  const reactShared = sharedByName.get('react')
  const reactDomShared = sharedByName.get('react-dom')

  expect(reactShared).toBeDefined()
  expect(reactDomShared).toBeDefined()
  expect(reactShared?.version).not.toBe('*')
  expect(reactDomShared?.version).not.toBe('*')
  expect(reactShared?.requiredVersion).not.toBe('^*')
  expect(reactDomShared?.requiredVersion).not.toBe('^*')
  expect(reactShared?.fallback).toBe('')
  expect(reactDomShared?.fallback).toBe('')
  const reactSyncAssets = reactShared?.assets?.js?.sync ?? []
  const reactDomSyncAssets = reactDomShared?.assets?.js?.sync ?? []

  expect(reactSyncAssets.length).toBeGreaterThan(0)
  expect(reactDomSyncAssets.length).toBeGreaterThan(0)
  assertRelativeJsAssetPaths([...reactSyncAssets, ...reactDomSyncAssets])
  await assertAssetServedAsJavaScript(page, '/dist', reactSyncAssets[0]!)
  await assertAssetServedAsJavaScript(page, '/dist', reactDomSyncAssets[0]!)

  await assertExposeContracts(page, manifest, '/dist')
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
