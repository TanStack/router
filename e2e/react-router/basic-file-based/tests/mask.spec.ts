import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function readLocation(page: Page) {
  return page.evaluate(() => {
    const location = (window as any).__TSR_TEST_ROUTER__.state.location
    return {
      pathname: location.pathname,
      maskedPathname: location.maskedLocation?.pathname,
      maskedSearch: location.maskedLocation?.search,
      maskedStateSource: location.maskedLocation?.state?.source,
    }
  })
}

test('route masks transform params and expose masked pathname in the browser (react)', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByTestId('link-to-masks').click()
  await expect(page.getByText('Route Masks')).toBeVisible()

  const link = page.getByTestId('link-to-admin-mask')
  await link.click()

  await page.waitForURL('/masks/public/user-42')

  await expect(page.getByTestId('admin-user-component')).toBeInViewport()
  await expect(page.getByTestId('admin-user-id')).toHaveText('42')

  await expect(page.getByTestId('router-pathname')).toHaveText(
    '/masks/admin/42',
  )

  await expect(page.getByTestId('router-masked-pathname')).toHaveText(
    '/masks/public/user-42',
  )
})

test('native history restores a reversible mask across traversal and reload', async ({
  page,
}) => {
  await page.goto('/masks')

  await page.evaluate(async () => {
    await (window as any).__TSR_TEST_ROUTER__.navigate({
      to: '/masks/admin/$userId',
      params: { userId: '42' },
      mask: {
        to: '/masks/public/$username',
        params: { username: 'user-42' },
        search: { source: 'reversible' },
        state: { source: 'state' },
        unmaskOnReload: false,
      },
    })
  })

  await page.waitForURL('/masks/public/user-42?source=reversible')
  await expect(page.getByTestId('admin-user-id')).toHaveText('42')
  expect(await readLocation(page)).toEqual({
    pathname: '/masks/admin/42',
    maskedPathname: '/masks/public/user-42',
    maskedSearch: { source: 'reversible' },
    maskedStateSource: 'state',
  })

  await page.evaluate(async () => {
    await (window as any).__TSR_TEST_ROUTER__.navigate({ to: '/masks' })
  })
  await page.waitForURL('/masks')
  await page.goBack()
  await expect(page.getByTestId('admin-user-id')).toHaveText('42')
  expect(await readLocation(page)).toMatchObject({
    pathname: '/masks/admin/42',
    maskedPathname: '/masks/public/user-42',
    maskedSearch: { source: 'reversible' },
    maskedStateSource: 'state',
  })

  await page.reload()
  await expect(page).toHaveURL('/masks/public/user-42?source=reversible')
  await expect(page.getByTestId('admin-user-id')).toHaveText('42')
  expect(await readLocation(page)).toMatchObject({
    pathname: '/masks/admin/42',
    maskedPathname: '/masks/public/user-42',
    maskedSearch: { source: 'reversible' },
    maskedStateSource: 'state',
  })
})
