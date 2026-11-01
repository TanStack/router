import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import { Generator, getConfig } from '@tanstack/router-generator'

const packages = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages',
)
const products = path.join(packages, 'products')

const editor = createHmrFileEditor({
  rootDir: products,
  files: {
    product: 'src/routes/$productId.tsx',
  },
})
const settingsEditor = createHmrFileEditor({
  rootDir: path.join(packages, 'settings'),
  files: {
    profile: 'src/routes/profile.tsx',
  },
})

test.afterEach(async () => {
  await editor.restoreFiles()
  await settingsEditor.restoreFiles()
})

test('editing a module route file hot-updates it in the application', async ({
  page,
}) => {
  await page.goto('/shop/products/7')
  await expect(page.getByRole('heading')).toHaveText('Product 7')
  await page.evaluate(() => {
    ;(window as any).__beforeHmr = true
  })

  await editor.replaceText(
    'product',
    '<h1>{product.name}</h1>',
    '<h1>Updated {product.name}</h1>',
  )
  await expect(page.getByRole('heading')).toHaveText('Updated Product 7')
  // A hot update, not a reload: page state survives.
  expect(await page.evaluate(() => (window as any).__beforeHmr)).toBe(true)
  await expect(page).toHaveURL('/shop/products/7?tab=specs')
})

test('editing a route of a module installed twice hot-updates every installation', async ({
  page,
}) => {
  await page.goto('/people/ada/settings/profile')
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

test('a route added to a module is served after the module regenerates', async ({
  page,
}) => {
  const newRoute = path.join(products, 'src/routes/brands.tsx')
  const { writeFile, rm } = await import('node:fs/promises')
  await writeFile(
    newRoute,
    `import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/brands')({
  component: () => <h1>Brands</h1>,
})
`,
  )
  try {
    // A workspace task reruns the provider's generation after the edit.
    const config = getConfig({ disableLogging: true }, products)
    await new Generator({ config, root: products }).run()

    await page.goto('/shop/products/brands')
    await expect(page.getByRole('heading')).toHaveText('Brands')
  } finally {
    await rm(newRoute)
    const config = getConfig({ disableLogging: true }, products)
    await new Generator({ config, root: products }).run()
  }
})
