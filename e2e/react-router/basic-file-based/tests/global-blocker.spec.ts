import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'

test('useBlockerState exposes state and resets navigation', async ({
  page,
}) => {
  await page.goto('/global-blocker/multi-blockers')

  const blocker1Status = page.getByTestId('blocker-1-status')
  const blocker2Status = page.getByTestId('blocker-2-status')
  const globalBlockingModalHeading = page.getByRole('heading', {
    name: 'Global Blocking Modal',
    exact: true,
  })
  const resetButton = page.getByRole('button', { name: 'Reset' })

  await expect(page.getByRole('heading')).toContainText(
    'This page always blocks navigation',
  )
  await expect(blocker1Status).toHaveText('blocker1 is idle')
  await expect(blocker2Status).toHaveText('blocker2 is idle')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(blocker1Status).toHaveText('blocker1 is blocked')
  await expect(blocker2Status).toHaveText('blocker2 is idle')
  await expect(globalBlockingModalHeading).toBeVisible()

  await resetButton.click()

  await expect(globalBlockingModalHeading).not.toBeVisible()
  await expect(blocker1Status).toHaveText('blocker1 is idle')
  await expect(blocker2Status).toHaveText('blocker2 is idle')
})

test('useBlockerState exposes state and proceed navigation', async ({
  page,
}) => {
  await page.goto('/global-blocker/multi-blockers')

  const blocker1Status = page.getByTestId('blocker-1-status')
  const blocker2Status = page.getByTestId('blocker-2-status')
  const globalBlockingModalHeading = page.getByRole('heading', {
    name: 'Global Blocking Modal',
    exact: true,
  })
  const proceedButton = page.getByRole('button', {
    name: 'Proceed',
    exact: true,
  })

  await expect(page.getByRole('heading')).toContainText(
    'This page always blocks navigation',
  )
  await expect(blocker1Status).toHaveText('blocker1 is idle')
  await expect(blocker2Status).toHaveText('blocker2 is idle')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(blocker1Status).toHaveText('blocker1 is blocked')
  await expect(blocker2Status).toHaveText('blocker2 is idle')
  await expect(globalBlockingModalHeading).toBeVisible()

  await proceedButton.click()

  await expect(blocker1Status).toHaveText('blocker1 is idle')
  await expect(blocker2Status).toHaveText('blocker2 is blocked')
  await expect(globalBlockingModalHeading).toBeVisible()

  await proceedButton.click()

  await expect(globalBlockingModalHeading).not.toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

test('useBlockerState exposes state and proceed navigation using proceedAll', async ({
  page,
}) => {
  await page.goto('/global-blocker/multi-blockers')

  const blocker1Status = page.getByTestId('blocker-1-status')
  const blocker2Status = page.getByTestId('blocker-2-status')
  const globalBlockingModalHeading = page.getByRole('heading', {
    name: 'Global Blocking Modal',
    exact: true,
  })
  const proceedAllButton = page.getByRole('button', { name: 'Proceed All' })

  await expect(page.getByRole('heading')).toContainText(
    'This page always blocks navigation',
  )
  await expect(blocker1Status).toHaveText('blocker1 is idle')
  await expect(blocker2Status).toHaveText('blocker2 is idle')

  await page.getByRole('link', { name: 'Home', exact: true }).click()

  await expect(blocker1Status).toHaveText('blocker1 is blocked')
  await expect(blocker2Status).toHaveText('blocker2 is idle')
  await expect(globalBlockingModalHeading).toBeVisible()

  await proceedAllButton.click()

  await expect(globalBlockingModalHeading).not.toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()
})

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

  // A second attempt must block again
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
  // SPA push creates a same-document back entry, then arm the blocker.
  await page.goto('/')
  await page.getByRole('link', { name: 'Global Blocker', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'This page always blocks navigation' }),
  ).toBeVisible()

  // Trigger a same-document popstate without awaiting (the blocker reverses it).
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

  // Proceed away so the blocking component unmounts and unregisters.
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Proceed', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!', exact: true }),
  ).toBeVisible()

  // A subsequent navigation must not be blocked by the removed blocker.
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(page).toHaveURL(/\/posts/)
})
