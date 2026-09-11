import { expect, test } from '@playwright/test'
test('routes preserve search and render a real missing-note response', async ({
  page,
  request,
}) => {
  await page.goto('/?q=server')
  await expect(
    page.getByRole('link', { name: 'Reading server HTML' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'My first route' })).toHaveCount(
    0,
  )
  await page.getByRole('link', { name: 'Reading server HTML' }).click()
  await expect(page).toHaveURL(/\/notes\/server-html$/)
  await expect(
    page.getByRole('heading', { name: 'Reading server HTML' }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Search notes')).toHaveValue('server')
  const missing = await request.get('/notes/does-not-exist')
  expect(missing.status()).toBe(404)
  expect(await missing.text()).toContain('Note not found')
})
