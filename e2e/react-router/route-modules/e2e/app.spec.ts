import { expect, test } from '@playwright/test'

test('the application links into mounted modules by namespace', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Cart' })).toHaveAttribute(
    'href',
    '/shop/cart',
  )
  await page.getByRole('link', { name: 'Pick of the day' }).click()
  await expect(page).toHaveURL('/shop/products/home-pick?tab=specs')
  await expect(page.getByRole('heading')).toHaveText('Product home-pick')
})

test('module-local links resolve inside the module', async ({ page }) => {
  await page.goto('/shop/products/3')
  await page.getByRole('link', { name: 'All products' }).click()
  await expect(page).toHaveURL('/shop/products')
  await expect(page.getByRole('link', { name: 'Product 1' })).toHaveAttribute(
    'href',
    '/shop/products/1',
  )
})

test('a module mounted under a layout gets its context and links into other modules', async ({
  page,
}) => {
  await page.goto('/account')
  await expect(page.getByRole('heading')).toHaveText('u-1')
  await expect(
    page.getByRole('link', { name: 'Last viewed product' }),
  ).toHaveAttribute('href', '/shop/products/last-viewed?tab=reviews')

  await page.getByRole('link', { name: 'Last order' }).click()
  await expect(page).toHaveURL('/account/orders/1')
  await page.getByRole('button', { name: 'Ordered product' }).click()
  await expect(page).toHaveURL('/shop/products/p-1?tab=specs')
  await expect(page.getByRole('heading')).toHaveText('Product p-1')
})

test('module routes are code-split from the application bundle', async ({
  page,
}) => {
  const scripts: Array<string> = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') {
      scripts.push(new URL(request.url()).pathname)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  expect(scripts.some((script) => script.includes('_productId'))).toBe(false)

  await page.getByRole('link', { name: 'Pick of the day' }).click()
  await expect(page.getByRole('heading')).toHaveText('Product home-pick')
  expect(scripts.some((script) => script.includes('_productId'))).toBe(true)
})

test('a module mounted under path params links within its organization', async ({
  page,
}) => {
  await page.goto('/')
  // The application passes the path params above the module.
  await page.getByRole('link', { name: 'Acme team' }).click()
  await expect(page).toHaveURL('/orgs/acme/team')
  await expect(
    page.getByRole('heading', { name: 'Team of ACME' }),
  ).toBeVisible()

  // Module-local links keep the path params of the current location.
  await page.getByRole('link', { name: 'grace' }).click()
  await expect(page).toHaveURL('/orgs/acme/team/members/grace')
  await expect(
    page.getByRole('heading', { name: 'grace at ACME' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'All members' }).click()
  await expect(page).toHaveURL('/orgs/acme/team')
})

test('a module that uses a module mounted under path params fills them from the location', async ({
  page,
}) => {
  await page.goto('/orgs/globex/billing')
  const contact = page.getByRole('link', { name: 'Billing contact' })
  await expect(contact).toHaveAttribute('href', '/orgs/globex/team/members/ada')
  await contact.click()
  await expect(
    page.getByRole('heading', { name: 'ada at GLOBEX' }),
  ).toBeVisible()
})

test('a module installed twice renders each installation with its own owner', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Globex settings' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings')
  await expect(
    page.getByRole('heading', { name: 'Settings of GLOBEX' }),
  ).toBeVisible()
  // Module-local links stay in the installation they render under.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings/profile')
  await expect(page.getByTestId('profile-kind')).toHaveText('organization')

  await page.goto('/')
  await page.getByRole('link', { name: "Ada's profile" }).click()
  await expect(page).toHaveURL('/people/ada/settings/profile')
  await expect(
    page.getByRole('heading', { name: 'Settings of Ada' }),
  ).toBeVisible()
  await expect(page.getByTestId('profile-kind')).toHaveText('person')
  await page.getByRole('link', { name: 'All settings' }).click()
  await expect(page).toHaveURL('/people/ada/settings')
})

test('a module that uses a module installed twice links to the installation above it', async ({
  page,
}) => {
  await page.goto('/orgs/globex/billing')
  const profile = page.getByRole('link', { name: 'Organization profile' })
  await expect(profile).toHaveAttribute('href', '/orgs/globex/settings/profile')
  await profile.click()
  await expect(page.getByTestId('profile-kind')).toHaveText('organization')
})
