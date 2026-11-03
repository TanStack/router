import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

for (const base of ['/orgs/globex/settings', '/people/ada/settings']) {
  test(`RouteApi and custom links resolve ${base}`, async ({ page }) => {
    await page.goto(`${base}/profile`)
    await expect(
      page.getByRole('link', { name: 'API members' }),
    ).toHaveAttribute('href', `${base}/members`)
    await expect(
      page.getByRole('link', { name: 'Custom members' }),
    ).toHaveAttribute('href', `${base}/members`)
    expect(
      await page
        .getByRole('link', { name: 'API members' })
        .getAttribute('_module'),
    ).toBeNull()
    expect(
      await page
        .getByRole('link', { name: 'Custom members' })
        .getAttribute('_module'),
    ).toBeNull()
    const hostId = base.split('/')[2]!
    const hostParams = base.startsWith('/orgs/')
      ? { orgId: hostId }
      : base.startsWith('/people/')
        ? { personId: hostId }
        : { userId: hostId }
    await expect(page.getByTestId('runtime-params')).toHaveText(
      JSON.stringify(hostParams),
    )
    await expect(page.getByText('PROFILE_MATCH', { exact: true })).toBeVisible()
    await expect(page.getByText('MEMBERS_MATCH', { exact: true })).toHaveCount(
      0,
    )
    await page.getByRole('link', { name: 'API members' }).click()
    await expect(page.getByText('MEMBERS_PAGE')).toBeVisible()
    await expect(page).toHaveURL(`${base}/members`)
  })

  test(`useLinkProps navigates within the document under ${base}`, async ({
    page,
  }) => {
    await page.goto(`${base}/profile`)
    await expect(
      page.getByRole('link', { name: 'Custom members' }),
    ).toBeVisible()
    const documentRequests: Array<string> = []
    page.on('request', (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        documentRequests.push(request.url())
      }
    })
    await page.getByRole('link', { name: 'Custom members' }).click()
    await expect(page.getByText('MEMBERS_PAGE')).toBeVisible()
    await expect(page).toHaveURL(`${base}/members`)
    expect(documentRequests).toEqual([])
  })

  test(`RouteApi navigation resolves ${base}`, async ({ page }) => {
    await page.goto(`${base}/profile`)
    await page.getByRole('button', { name: 'Navigate members' }).click()
    await expect(page.getByText('MEMBERS_PAGE')).toBeVisible()
    await expect(page).toHaveURL(`${base}/members`)
  })

  test(`Navigate captures installation under ${base}`, async ({ page }) => {
    await page.goto(`${base}/forward`)
    await expect(page.getByText('MEMBERS_PAGE')).toBeVisible()
    await expect(page).toHaveURL(`${base}/members`)
  })

  test.describe(`component notFound under ${base}`, () => {
    test.use({
      // React reports the deliberately thrown value before the boundary handles it.
      whitelistErrors: [
        /^\{routeId: @route-modules\/settings:, isNotFound: true\}$/,
      ],
    })
    test('reaches the module boundary', async ({ page }) => {
      await page.goto(`${base}/missing`)
      await expect(page.getByText('MODULE_NOT_FOUND')).toBeVisible()
    })
  })
  for (const button of ['Route up', 'Explicit from home']) {
    test(`${button} uses the route origin under ${base}`, async ({ page }) => {
      await page.goto(`${base}/profile`)
      await page.getByRole('button', { name: button, exact: true }).click()
      await expect(page).toHaveURL(base)
      await expect(
        page.getByRole('link', { name: 'Profile', exact: true }),
      ).toHaveAttribute('href', `${base}/profile`)
    })
  }

  test(`scoped router view builds and navigates under ${base}`, async ({
    page,
  }) => {
    await page.goto(`${base}/profile`)
    await expect(page.getByTestId('scoped-href')).toHaveText(`${base}/members`)
    await page.getByRole('button', { name: 'Router members' }).click()
    await expect(page).toHaveURL(`${base}/members`)
    const profile = page.getByRole('link', { name: 'Profile', exact: true })
    await expect(profile).toHaveAttribute('href', `${base}/profile`)
    await profile.click()
    await expect(page).toHaveURL(`${base}/profile`)
  })

  test(`Route.Link keeps the installation under ${base}`, async ({ page }) => {
    await page.goto(`${base}/profile`)
    const home = page.getByRole('link', { name: 'Route home', exact: true })
    await expect(home).toHaveAttribute('href', base)
    await home.click()
    await expect(page).toHaveURL(base)
    await expect(
      page.getByRole('link', { name: 'Profile', exact: true }),
    ).toHaveAttribute('href', `${base}/profile`)
  })

  test(`scoped lifecycle redirects retain the installation under ${base}`, async ({
    page,
  }) => {
    await page.goto(`${base}/legacy`)
    await expect(page).toHaveURL(`${base}/profile`)
    await expect(page.getByText('PROFILE_MATCH', { exact: true })).toBeVisible()
  })

  test(`framework imports keep application coordinates inside ${base}`, async ({
    page,
  }) => {
    await page.goto(`${base}/profile`)
    const home = page.getByRole('link', { name: 'Application home' })
    await expect(home).toHaveAttribute('href', '/')
    await home.click()
    await expect(page).toHaveURL('/')
  })
}

test('a local Link resolves options already wrapped by the same local scope', async ({
  page,
}) => {
  await page.goto('/orgs/globex/settings/profile')
  const members = page.getByRole('link', {
    name: 'Acme members',
    exact: true,
  })
  await expect(members).toHaveAttribute('href', '/orgs/acme/settings/members')
  await members.click()
  await expect(page).toHaveURL('/orgs/acme/settings/members')
  await expect(page.getByText('MEMBERS_PAGE')).toBeVisible()
})

test('module observers and router views follow real installation changes', async ({
  page,
}) => {
  await page.goto('/orgs/globex/settings/profile')
  await expect(page.getByTestId('organization-profile')).toHaveText(
    '@route-modules/settings#orgSettings:/profile',
  )
  await expect(page.getByTestId('scoped-href')).toHaveText(
    '/orgs/globex/settings/members',
  )
  await page.getByRole('link', { name: 'API members' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings/members')
  await page.getByRole('link', { name: 'Switch to person' }).click()
  await expect(page).toHaveURL('/people/ada/settings/profile')
  await expect(page.getByTestId('organization-profile')).toHaveText('none')
  await expect(page.getByTestId('scoped-href')).toHaveText(
    '/people/ada/settings/members',
  )
  await page.getByRole('link', { name: 'Switch to organization' }).click()
  await expect(page).toHaveURL('/orgs/globex/settings/profile')
  await expect(page.getByRole('link', { name: 'API members' })).toHaveAttribute(
    'href',
    '/orgs/globex/settings/members',
  )
  const readObserved = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            observedModuleMatches: Array<string | undefined>
          }
        ).observedModuleMatches,
    )
  await expect
    .poll(readObserved)
    .toContain('@route-modules/settings#personSettings:/profile')
  const observed = await readObserved()
  expect(observed).toContain('@route-modules/settings#orgSettings:/profile')
  expect(observed).not.toContain(undefined)
})

test('singleton scoped redirects and namespaced search input survive generation', async ({
  page,
}) => {
  await page.goto('/shop/products/legacy')
  await expect(
    page.getByRole('heading', { name: 'Product 42', exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/shop/products/42')
  await expect(page.getByText('Dimensions, materials and care.')).toBeVisible()

  await page.goto('/shop')
  const compare = page.getByRole('link', { name: 'Compare', exact: true })
  await expect(compare).toHaveAttribute(
    'href',
    '/shop/products/compare?ids=%5B%221%22%2C%222%22%5D',
  )
  await compare.click()
  await expect(page.getByText('Comparing products 1 and 2.')).toBeVisible()
})
