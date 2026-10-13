import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating nested layouts', async ({ page }) => {
  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('#app')).toContainText("I'm a layout")
  await expect(page.locator('#app')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout B!")
})

test('Navigating to a not-found route', async ({ page }) => {
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await expect(page.getByRole('paragraph')).toContainText(
    'This is the notFoundComponent configured on root route',
  )
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})

test('Navigating to a post page with viewTransition', async ({ page }) => {
  await page.getByRole('link', { name: 'View Transition', exact: true }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating to a post page with viewTransition types', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'View Transition types' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Link in SVG does not trigger a full page reload', async ({ page }) => {
  let fullPageLoad = false
  page.on('domcontentloaded', () => {
    fullPageLoad = true
  })

  await page.getByRole('link', { name: 'Open posts from SVG' }).click()
  const url = `http://localhost:${PORT}/posts`
  await page.waitForURL(url)

  expect(fullPageLoad).toBeFalsy()
})

for (const linkName of ['View Transition', 'View Transition types']) {
  test(`${linkName} still navigates when duplicate names skip the animation`, async ({
    page,
  }) => {
    const errors: Array<string> = []
    page.on('pageerror', (error) => errors.push(error.message))
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe(
      'function',
    )
    if (linkName === 'View Transition types') {
      expect(
        await page.evaluate(() =>
          CSS.supports('selector(:active-view-transition-type(a))'),
        ),
      ).toBe(true)
    }
    await page.evaluate(() => {
      for (const text of ['first', 'second']) {
        const element = document.createElement('div')
        element.textContent = text
        element.style.viewTransitionName = 'duplicate'
        document.body.append(element)
      }
    })
    await page.getByRole('link', { name: linkName, exact: true }).click()
    await expect(
      page.getByRole('link', { name: 'sunt aut facere repe' }),
    ).toBeVisible()
    // Flush rendering and its promise-rejection checkpoint, not an arbitrary delay.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )
    expect(errors).toEqual([])
    await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
    await expect(page.getByRole('heading')).toContainText('sunt aut facere')
  })
}
