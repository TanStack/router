import { expect, test } from '@playwright/test'

test('the router devtools group the routes of mounted modules', async ({
  page,
}) => {
  await page.goto('/shop/products/7')
  await page
    .getByRole('button', { name: 'Open TanStack Router Devtools' })
    .click()

  // A module's group sits inside the group of the module that mounts it.
  const outer = page.getByRole('group', {
    name: 'Route module @route-modules/storefront',
  })
  await expect(outer).toBeVisible()
  await expect(
    outer.getByRole('group', { name: 'Route module @route-modules/products' }),
  ).toBeVisible()

  await page
    .getByRole('button', {
      name: 'Open module details for @route-modules/products',
    })
    .first()
    .click()
  const details = page.getByRole('region', { name: 'Module details' })
  await expect(details).toContainText('Mount path:/shop/products')
  await expect(details).toContainText('Parent module:@route-modules/storefront')
})

test('the router devtools show each installation of a module installed twice', async ({
  page,
}) => {
  await page.goto('/people/ada/settings')
  await page
    .getByRole('button', { name: 'Open TanStack Router Devtools' })
    .click()

  for (const installation of ['orgSettings', 'personSettings']) {
    await expect(
      page.getByRole('group', {
        name: `Route module @route-modules/settings#${installation}`,
      }),
    ).toBeVisible()
  }
})
