import { expect, test } from '@playwright/test'

test('the router devtools group the routes of mounted modules', async ({
  page,
}) => {
  await page.goto('/shop/lamp')
  await page.getByTestId('hydrated').waitFor()
  await page
    .getByRole('button', { name: 'Open TanStack Router Devtools' })
    .click()

  await expect(
    page.getByRole('group', {
      name: 'Route module @start-route-modules/catalog',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('group', {
      name: 'Route module @start-route-modules/notes',
    }),
  ).toBeVisible()

  await page
    .getByRole('button', {
      name: 'Open module details for @start-route-modules/catalog',
    })
    .first()
    .click()
  const details = page.getByRole('region', { name: 'Module details' })
  await expect(details).toContainText('Mount path:/shop')
  await expect(details).toContainText('Parent module:Application')
})

test('the router devtools show each installation of a module installed twice', async ({
  page,
}) => {
  await page.goto('/people/ada/settings')
  await page.getByTestId('hydrated').waitFor()
  await page
    .getByRole('button', { name: 'Open TanStack Router Devtools' })
    .click()

  for (const installation of ['orgSettings', 'personSettings']) {
    await expect(
      page.getByRole('group', {
        name: `Route module @start-route-modules/settings#${installation}`,
      }),
    ).toBeVisible()
  }
})
