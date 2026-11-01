import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

for (const base of ['/orgs/7/settings', '/users/u1/settings']) {
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

  test(`component notFound reaches module boundary under ${base}`, async ({
    page,
  }) => {
    await page.goto(`${base}/missing`)
    await expect(page.getByText('MODULE_NOT_FOUND')).toBeVisible()
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
    const host = page.getByRole('link', { name: 'Application host' })
    await expect(host).toHaveAttribute('href', '/orgs/9')
    await host.click()
    await expect(page).toHaveURL('/orgs/9')
  })
}

test('module observers and router views follow real installation changes', async ({
  page,
}) => {
  await page.goto('/orgs/7/settings/profile')
  await expect(page.getByTestId('organization-profile')).toHaveText(
    '@route-modules/solid-settings#orgSettings:/profile',
  )
  await expect(page.getByTestId('scoped-href')).toHaveText(
    '/orgs/7/settings/members',
  )
  await page.getByRole('link', { name: 'API members' }).click()
  await expect(page).toHaveURL('/orgs/7/settings/members')
  await page.getByRole('link', { name: 'Switch to person' }).click()
  await expect(page).toHaveURL('/users/u1/settings/profile')
  await expect(page.getByTestId('organization-profile')).toHaveText('none')
  await expect(page.getByTestId('scoped-href')).toHaveText(
    '/users/u1/settings/members',
  )
  await page.getByRole('link', { name: 'Switch to organization' }).click()
  await expect(page).toHaveURL('/orgs/7/settings/profile')
  await expect(page.getByRole('link', { name: 'API members' })).toHaveAttribute(
    'href',
    '/orgs/7/settings/members',
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
    .toContain('@route-modules/solid-settings#userSettings:/profile')
  const observed = await readObserved()
  expect(observed).toContain(
    '@route-modules/solid-settings#orgSettings:/profile',
  )
  expect(observed).not.toContain(undefined)
})
