import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import { Generator, getConfig } from '@tanstack/router-generator'
import type { Page } from '@playwright/test'

const catalog = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/catalog',
)

const editor = createHmrFileEditor({
  rootDir: catalog,
  files: {
    product: 'src/routes/$productId.tsx',
    api: 'src/api.ts',
    index: 'src/routes/index.tsx',
  },
})
const settingsEditor = createHmrFileEditor({
  rootDir: path.resolve(catalog, '../settings'),
  files: {
    profile: 'src/routes/profile.tsx',
  },
})

test.afterEach(async () => {
  await editor.restoreFiles()
  await settingsEditor.restoreFiles()
})

// The server-rendered page shows the product before the browser has loaded
// the route module. Edit only after hydration: an edit before it is served to
// the hydrating browser, which then mismatches the server's HTML instead of
// receiving a hot update.
async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.getByTestId('hydrated').waitFor()
}

test('editing a module route file hot-updates it in the application', async ({
  page,
}) => {
  await gotoHydrated(page, '/shop/lamp')
  await expect(page.getByRole('heading', { name: 'Desk lamp' })).toBeVisible()
  await page.evaluate(() => {
    ;(window as any).__beforeHmr = true
  })

  await editor.replaceText(
    'product',
    '<h3>{product.name}</h3>',
    '<h3>Updated {product.name}</h3>',
  )
  await expect(
    page.getByRole('heading', { name: 'Updated Desk lamp' }),
  ).toBeVisible()
  // A hot update, not a reload: page state survives.
  expect(await page.evaluate(() => (window as any).__beforeHmr)).toBe(true)

  // Restore while the page is open. Server rendering reads the file again,
  // but the browser gets the client's compiled module until Vite processes
  // the change; the hot update shows it has, so the next page load hydrates.
  await editor.restoreFiles()
  await expect(
    page.getByRole('heading', { name: 'Desk lamp', exact: true }),
  ).toBeVisible()
})

test('a module server function runs its edited implementation', async ({
  page,
}) => {
  await gotoHydrated(page, '/shop/lamp')
  await expect(page.getByRole('heading', { name: 'Desk lamp' })).toBeVisible()

  await editor.replaceText('api', "name: 'Desk lamp'", "name: 'Reading lamp'")
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(
      page.getByRole('heading', { name: 'Reading lamp' }),
    ).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(page.getByTestId('price')).toHaveText('49.00 EUR')
})

test('editing a route of a module installed twice hot-updates every installation', async ({
  page,
}) => {
  await gotoHydrated(page, '/people/ada/settings/profile')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.evaluate(() => {
    ;(window as any).__beforeHmr = true
  })

  await settingsEditor.replaceText(
    'profile',
    '<h3>Profile</h3>',
    '<h3>Updated profile</h3>',
  )
  await expect(
    page.getByRole('heading', { name: 'Updated profile' }),
  ).toBeVisible()

  // The installation of the organizations runs the updated route too.
  await page.evaluate(() =>
    (window as any).__TSR_ROUTER__.navigate({
      to: '/orgs/acme/settings/profile',
    }),
  )
  await expect(page.getByTestId('profile-kind')).toHaveText('organization')
  await expect(
    page.getByRole('heading', { name: 'Updated profile' }),
  ).toBeVisible()
  // Hot updates, not reloads: page state survives.
  expect(await page.evaluate(() => (window as any).__beforeHmr)).toBe(true)
})

test('provider classification changes refresh the client tree and preserve server endpoints', async ({
  page,
  request,
}) => {
  await editor.capturePromise
  const providerGenerator = new Generator({
    root: catalog,
    config: getConfig({ disableLogging: true }, catalog),
  })
  const hasCatalogPage = () =>
    page.evaluate(() => {
      const router = (window as any).__TSR_ROUTER__
      return router
        ? Object.hasOwn(router.routesById, '@start-route-modules/catalog:/')
        : undefined
    })
  const expectCatalogPage = (present: boolean) =>
    expect(async () => {
      // Topology publication may reload the document; retry through navigation
      // and require an initialized router before checking its route inventory.
      expect(await hasCatalogPage()).toBe(present)
    }).toPass()
  await gotoHydrated(page, '/')
  await expectCatalogPage(true)
  try {
    await editor.rewriteFile(
      'index',
      () => `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@start-route-modules/catalog:/')({
  server: { handlers: { GET: () => new Response('catalog endpoint') } },
})
`,
    )
    await providerGenerator.run()
    await expectCatalogPage(false)
    await expect(async () => {
      const response = await request.get('/shop')
      expect(response.status()).toBe(200)
      expect(await response.text()).toBe('catalog endpoint')
    }).toPass()

    await editor.restoreFiles()
    await providerGenerator.run()
    await expectCatalogPage(true)
    await gotoHydrated(page, '/shop')
    await expect(page.getByTestId('price-chair')).toHaveText('129.00 EUR')
  } finally {
    await editor.restoreFiles()
    await providerGenerator.run()
  }
})
