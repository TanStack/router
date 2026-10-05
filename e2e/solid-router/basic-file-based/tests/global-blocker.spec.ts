import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'

test('useBlockerState starts idle with no active blocker', async ({ page }) => {
  await page.goto('/global-blocker/single-blocker')

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is idle',
  )
  await expect(page.getByTestId('blocker-status')).toHaveText('blocker is idle')
  await expect(
    page.getByRole('heading', { name: 'Global Blocking Modal' }),
  ).not.toBeVisible()
})

test('useBlockerState: proceed allows a single blocked navigation', async ({
  page,
}) => {
  await page.goto('/global-blocker/single-blocker')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is blocked',
  )
  await expect(page.getByTestId('blocker-status')).toHaveText(
    'blocker is blocked',
  )

  await page.getByRole('button', { name: 'Proceed', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

test('useBlockerState: reset cancels a single blocked navigation', async ({
  page,
}) => {
  await page.goto('/global-blocker/single-blocker')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is blocked',
  )

  await page.getByRole('button', { name: 'Reset' }).click()

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is idle',
  )
  await expect(
    page.getByRole('heading', { name: 'This page always blocks navigation' }),
  ).toBeVisible()
})

test('useBlockerState: repeated attempts block again after reset', async ({
  page,
}) => {
  await page.goto('/global-blocker/single-blocker')

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is blocked',
  )
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is idle',
  )

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is blocked',
  )

  await page.getByRole('button', { name: 'Proceed', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

test('useBlockerState: blocks browser back navigation and proceed resolves it', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Global Blocker', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'This page always blocks navigation' }),
  ).toBeVisible()

  await page.evaluate(() => window.history.back())

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is blocked',
  )

  await page.getByRole('button', { name: 'Proceed', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

test('useBlockerState: blocker is cleaned up after navigating away', async ({
  page,
}) => {
  await page.goto('/global-blocker/single-blocker')

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Proceed', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(page).toHaveURL(/\/posts/)
})

test('useBlockerState: reset with multiple blockers', async ({ page }) => {
  await page.goto('/global-blocker/multi-blockers')

  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is idle',
  )
  await expect(page.getByTestId('blocker-2-status')).toHaveText(
    'blocker2 is idle',
  )

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is blocked',
  )
  await expect(page.getByTestId('blocker-2-status')).toHaveText(
    'blocker2 is idle',
  )

  await page.getByRole('button', { name: 'Reset' }).click()

  await expect(page.getByTestId('global-blocker-status')).toHaveText(
    'global status is idle',
  )
  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is idle',
  )
})

test('useBlockerState: proceed resolves multiple blockers sequentially', async ({
  page,
}) => {
  await page.goto('/global-blocker/multi-blockers')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is blocked',
  )
  await expect(page.getByTestId('blocker-2-status')).toHaveText(
    'blocker2 is idle',
  )

  await page.getByRole('button', { name: 'Proceed', exact: true }).click()

  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is idle',
  )
  await expect(page.getByTestId('blocker-2-status')).toHaveText(
    'blocker2 is blocked',
  )

  await page.getByRole('button', { name: 'Proceed', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

test('useBlockerState: proceedAll resolves every blocker at once', async ({
  page,
}) => {
  await page.goto('/global-blocker/multi-blockers')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(page.getByTestId('blocker-1-status')).toHaveText(
    'blocker1 is blocked',
  )

  await page.getByRole('button', { name: 'Proceed All' }).click()

  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})
