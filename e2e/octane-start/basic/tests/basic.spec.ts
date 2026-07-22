import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const fixtureRoot = path.resolve(import.meta.dirname, '..')

test.use({
  whitelistErrors: [
    'Failed to load resource: the server responded with a status of 404',
  ],
})

function getOutputDir() {
  return path.resolve(fixtureRoot, process.env.E2E_DIST_DIR ?? '.output')
}

function findBuiltAsset(extension: string, sourceNeedle: string) {
  const assetsDir = path.join(getOutputDir(), 'public', 'assets')
  const matches = fs.readdirSync(assetsDir).filter((fileName) => {
    return (
      fileName.endsWith(extension) &&
      fs
        .readFileSync(path.join(assetsDir, fileName), 'utf8')
        .includes(sourceNeedle)
    )
  })

  expect(matches).toHaveLength(1)
  return matches[0]!
}

function readStartManifest() {
  const serverDir = path.join(getOutputDir(), 'server')
  const matches = fs
    .readdirSync(serverDir)
    .filter((fileName) => fileName.startsWith('_tanstack-start-manifest_'))

  expect(matches).toHaveLength(1)
  return fs.readFileSync(path.join(serverDir, matches[0]!), 'utf8')
}

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

test('loads GET server functions from loaders, including deferred results', async ({
  page,
}) => {
  const serverFunctionRequests: Array<string> = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) {
      serverFunctionRequests.push(request.method())
    }
  })

  await page.goto('/')
  await page.getByRole('link', { name: 'Deferred' }).click()

  await expect(page.getByTestId('regular-person')).toHaveText(
    'Octane immediate',
  )
  await expect(page.getByTestId('deferred-person')).toHaveText(
    'TanStack deferred',
  )
  expect(serverFunctionRequests.length).toBeGreaterThanOrEqual(2)
  expect(serverFunctionRequests.every((method) => method === 'GET')).toBe(true)
})

test('preserves parent route state while navigating between child routes', async ({
  page,
}) => {
  await page.goto('/posts')
  await expect(page.getByTestId('posts-index')).toBeVisible()

  await page.getByTestId('posts-parent-counter').click()
  await expect(page.getByTestId('posts-parent-counter')).toHaveText(
    'Parent count 1',
  )

  await page.getByRole('link', { name: 'Second post' }).click()
  await expect(page.getByTestId('post-detail')).toContainText(
    'Body of the second post.',
  )
  await expect(page.getByTestId('posts-parent-counter')).toHaveText(
    'Parent count 1',
  )
})

test('routes notFound thrown by a loader server function to its boundary', async ({
  page,
}) => {
  const response = await page.goto('/posts/missing')

  expect(response?.status()).toBe(404)
  await expect(page.getByTestId('post-not-found')).toHaveText('Post not found')
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

test('adopts deferred Hydrate HTML while keeping its JavaScript lazy', async ({
  page,
  request,
}) => {
  const deferredJavaScript = findBuiltAsset(
    '.js',
    '__octaneStartDeferredHydrationModuleLoaded',
  )
  const deferredCss = findBuiltAsset(
    '.css',
    '.octane-start-deferred-hydration-proof',
  )
  const manifest = readStartManifest()

  const response = await request.get('/hydrate')
  expect(response.status()).toBe(200)
  const html = await response.text()

  expect(html).toContain('deferred hydration clicks 0')
  expect(html).toContain('server fallback')
  expect(html).not.toContain('client-only module rendered')
  expect(html).toContain(`/assets/${deferredCss}`)
  expect(html).not.toContain(`/assets/${deferredJavaScript}`)
  expect(manifest).toContain(`/assets/${deferredCss}`)
  expect(manifest).not.toContain(`/assets/${deferredJavaScript}`)

  const unrelatedResponse = await request.get('/about')
  expect(unrelatedResponse.status()).toBe(200)
  expect(await unrelatedResponse.text()).not.toContain(`/assets/${deferredCss}`)

  const browserErrors: Array<string> = []
  const requestedScripts: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (pageRequest) => {
    if (pageRequest.resourceType() === 'script') {
      requestedScripts.push(new URL(pageRequest.url()).pathname)
    }
  })

  await page.addInitScript(() => {
    const proof = window as typeof window & {
      __octaneStartDeferredHydrationServerNode?: Element | null
    }
    const captureServerNode = () => {
      const node = document.querySelector(
        '.octane-start-deferred-hydration-proof',
      )
      if (node !== null) {
        proof.__octaneStartDeferredHydrationServerNode ??= node
        observer.disconnect()
      }
    }
    const observer = new MutationObserver(captureServerNode)
    observer.observe(document, { childList: true, subtree: true })
    captureServerNode()
  })

  await page.goto('/hydrate')
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as typeof window & {
            __octaneStartHydrateRouteReady?: boolean
          }
        ).__octaneStartHydrateRouteReady
      }),
    )
    .toBe(true)
  await expect(page.getByTestId('hydrate-eager')).toHaveText(
    'eager route content',
  )
  await expect(page.getByTestId('client-only-proof')).toHaveText(
    'client-only module rendered',
  )
  await expect(page.getByTestId('client-only-fallback')).toHaveCount(0)

  const deferredProof = page.getByTestId('deferred-hydration-proof')
  await expect(deferredProof).toHaveText('deferred hydration clicks 0')
  await expect(deferredProof).toHaveCSS('color', 'rgb(12, 34, 56)')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )

  const deferredScriptPath = `/assets/${deferredJavaScript}`
  expect(requestedScripts).not.toContain(deferredScriptPath)
  expect(
    await deferredProof.evaluate((node) => {
      const proof = window as typeof window & {
        __octaneStartDeferredHydrationModuleLoaded?: boolean
        __octaneStartDeferredHydrationServerNode?: Element | null
      }
      return {
        dormant: node.parentElement?.getAttribute('data-octane-hydrate-when'),
        moduleLoaded: proof.__octaneStartDeferredHydrationModuleLoaded === true,
        sameNode: proof.__octaneStartDeferredHydrationServerNode === node,
      }
    }),
  ).toEqual({ dormant: 'interaction', moduleLoaded: false, sameNode: true })

  await deferredProof.click()
  await expect(deferredProof).toHaveText('deferred hydration clicks 1')
  await expect
    .poll(() => requestedScripts.includes(deferredScriptPath))
    .toBe(true)
  expect(
    await deferredProof.evaluate((node) => {
      const proof = window as typeof window & {
        __octaneStartDeferredHydrationModuleLoaded?: boolean
        __octaneStartDeferredHydrationServerNode?: Element | null
      }
      return {
        dormant: node.parentElement?.hasAttribute('data-octane-hydrate-when'),
        moduleLoaded: proof.__octaneStartDeferredHydrationModuleLoaded === true,
        sameNode: proof.__octaneStartDeferredHydrationServerNode === node,
      }
    }),
  ).toEqual({ dormant: false, moduleLoaded: true, sameNode: true })
  expect(browserErrors).toEqual([])
})
