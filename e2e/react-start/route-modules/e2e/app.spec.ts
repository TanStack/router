import { expect, test } from '@playwright/test'

test('the server renders module routes with the context the application provides', async ({
  request,
}) => {
  const html = await (await request.get('/shop/lamp')).text()
  expect(html).toContain('Desk lamp')
  // `shopper` comes from the application's request middleware, the currency
  // from the catalog's own pricing middleware.
  expect(html).toContain('49.00 EUR')
  expect(html).toContain('Shopper: <!-- -->ada')
})

test('module data hydrates through the module serialization adapter', async ({
  page,
}) => {
  await page.goto('/shop/lamp')
  await expect(page.getByTestId('price')).toHaveText('49.00 EUR')
  const renderedAt = await page.getByTestId('rendered-at').textContent()

  // The route's loader runs again on the client and calls the module's
  // server function; its result goes through the serialization adapter.
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByTestId('rendered-at')).not.toHaveText(renderedAt!)
  await expect(page.getByTestId('price')).toHaveText('49.00 EUR')
  await expect(page.getByTestId('shopper')).toHaveText('Shopper: ada')
})

test('client navigation loads module routes through their server functions', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await page.getByRole('link', { name: 'Catalog' }).click()
  await expect(page).toHaveURL('/shop')
  await expect(page.getByTestId('price-chair')).toHaveText('129.00 EUR')

  await page.getByRole('link', { name: 'Office chair' }).click()
  await expect(page).toHaveURL('/shop/chair')
  await expect(
    page.getByRole('heading', { name: 'Office chair' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'All products' }).click()
  await expect(page).toHaveURL('/shop')
})

test('a router-only module renders in the Start application', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Notes' }).click()
  await expect(page).toHaveURL('/notes')
  await expect(page.getByTestId('notes')).toContainText('Compose route modules')
})

test('module routes are code-split from the application bundle', async ({
  page,
}) => {
  // Chunk names differ between toolchains: find the product page's code by
  // its text in the scripts the browser loads.
  const scripts: Array<Promise<string>> = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push(response.text())
    }
  })
  const loadsProductPage = async () =>
    (await Promise.all(scripts)).some((script) =>
      script.includes('Rendered at'),
    )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  expect(await loadsProductPage()).toBe(false)

  await page.getByRole('link', { name: 'Lamp' }).click()
  await expect(page.getByRole('heading', { name: 'Desk lamp' })).toBeVisible()
  await expect.poll(loadsProductPage).toBe(true)
})

test('the server renders a module mounted under path params', async ({
  request,
}) => {
  const html = await (await request.get('/orgs/acme/team')).text()
  expect(html).toContain('Team of ACME')
  // The module's server function loads the members of the organization in the URL.
  expect(html).toContain('grace (acme)')
})

test('links into and inside a module mounted under path params', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hydrated').waitFor()
  // The application passes the path params above the module.
  await page.getByRole('link', { name: 'Acme team' }).click()
  await expect(page).toHaveURL('/orgs/acme/team')
  await expect(
    page.getByRole('heading', { name: 'Team of ACME' }),
  ).toBeVisible()

  // Module-local links keep the path params of the current location.
  await page.getByRole('link', { name: 'grace (acme)' }).click()
  await expect(page).toHaveURL('/orgs/acme/team/members/grace')
  await expect(
    page.getByRole('heading', { name: 'grace at ACME' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'All members' }).click()
  await expect(page).toHaveURL('/orgs/acme/team')
})

test('the server renders each installation of a module installed twice', async ({
  request,
}) => {
  const person = await (
    await request.get('/people/ada/settings/profile')
  ).text()
  expect(person).toContain('Settings of Ada')
  expect(person).toContain('@ada')
  const organization = await (
    await request.get('/orgs/acme/settings/profile')
  ).text()
  expect(organization).toContain('Settings of ACME')
  expect(organization).toContain('@acme')
})

test('links of a module installed twice stay in their installation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hydrated').waitFor()
  await page.getByRole('link', { name: 'Globex settings' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings')
  await expect(
    page.getByRole('heading', { name: 'Settings of GLOBEX' }),
  ).toBeVisible()
  // The profile loads through the module's server function.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings/profile')
  await expect(page.getByTestId('profile-kind')).toHaveText('organization')

  await page.goto('/')
  await page.getByTestId('hydrated').waitFor()
  await page.getByRole('link', { name: "Ada's profile" }).click()
  await expect(page).toHaveURL('/people/ada/settings/profile')
  await expect(page.getByTestId('profile-kind')).toHaveText('person')
  await page.getByRole('link', { name: 'All settings' }).click()
  await expect(page).toHaveURL('/people/ada/settings')
})

test('a module that uses a module installed twice links to the installation above it', async ({
  page,
}) => {
  await page.goto('/orgs/acme/team')
  await page.getByTestId('hydrated').waitFor()
  const profile = page.getByRole('link', { name: 'Organization profile' })
  await expect(profile).toHaveAttribute('href', '/orgs/acme/settings/profile')
  await profile.click()
  await expect(page.getByTestId('profile-kind')).toHaveText('organization')
})
