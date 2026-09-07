import { expect, test } from '@playwright/test'
import { getDummyServerPort } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

const externalPort = await getDummyServerPort(packageJson.name)
const adminHref = `http://localhost:${externalPort}/`

for (const { button, href, replace } of [
  { button: 'Navigate to admin', href: adminHref, replace: false },
  { button: 'Replace with admin', href: adminHref, replace: true },
  { button: 'Reload admin', href: adminHref, replace: false },
  {
    button: 'Navigate to absolute href',
    href: `${adminHref}?value=a+b&value=a%20b#raw%2f`,
    replace: false,
  },
]) {
  test(button, async ({ page }) => {
    const errors: Array<Error> = []
    page.on('pageerror', (error) => errors.push(error))
    await page.goto('/')
    await page.goto('/document-navigation')
    const historyLength = await page.evaluate(() => window.history.length)
    const response = page.waitForResponse(href.split('#')[0]!)

    await page.getByRole('button', { name: button, exact: true }).click()

    expect((await response).request().isNavigationRequest()).toBe(true)
    await expect(page).toHaveURL(href)
    await expect(page.locator('body')).toHaveText('Hello World')
    expect(await page.evaluate(() => window.history.length)).toBe(
      historyLength + (replace ? 0 : 1),
    )
    expect(errors).toEqual([])

    await page.goBack()

    await expect(page).toHaveURL(replace ? '/' : '/document-navigation')
  })
}

test('explicit reload resolves a raw relative href in the browser', async ({
  page,
}) => {
  await page.goto('/document-navigation')
  const response = page.waitForResponse((candidate) =>
    candidate.request().isNavigationRequest(),
  )

  await page.getByRole('button', { name: 'Reload relative href' }).click()

  expect((await response).request().resourceType()).toBe('document')
  await expect(page).toHaveURL('/?value=a+b&value=a%20b#raw%2f')
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
