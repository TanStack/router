import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function prepareDocumentTraversal(
  page: Page,
  direction: 'back' | 'forward',
) {
  if (direction === 'back') {
    await page.goto('/')
    await page.goto('/history-blocking')
  } else {
    await page.goto('/history-blocking')
    await page.goto('/')
    await page.goBack()
  }
  await expect(
    page.getByRole('heading', { name: 'History blocking' }),
  ).toBeVisible()
  await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
}

function dismissUnloadDialogs(page: Page) {
  const dialogs: Array<string> = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type())
    await dialog.dismiss()
  })
  return dialogs
}

for (const direction of ['back', 'forward'] as const) {
  test(`history ${direction} to another document warns before losing edits`, async ({
    page,
  }) => {
    await prepareDocumentTraversal(page, direction)
    const dialogs = dismissUnloadDialogs(page)
    const originalUrl = page.url()

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page).toHaveURL(originalUrl)
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  test(`history ${direction} can explicitly bypass a document unload warning`, async ({
    page,
  }) => {
    await prepareDocumentTraversal(page, direction)
    await page.getByLabel('Ignore blockers').check()
    const dialogs = dismissUnloadDialogs(page)

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect(page).toHaveURL(/\/$/)
    expect(dialogs).toEqual([])
  })

  test(`ignored same-document ${direction} preserves the next document unload warning`, async ({
    page,
  }) => {
    await page.goto('/history-blocking')
    await page.getByRole('link', { name: 'Add history entry' }).click()
    await expect(page.getByText('Step 1', { exact: true })).toBeVisible()
    if (direction === 'forward') {
      await page
        .getByRole('button', { name: 'History back', exact: true })
        .click()
      await expect(page.getByText('Step 0', { exact: true })).toBeVisible()
    }
    await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
    await page.getByLabel('Ignore blockers').check()
    const dialogs = dismissUnloadDialogs(page)

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect(
      page.getByText(direction === 'back' ? 'Step 0' : 'Step 1', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
    expect(dialogs).toEqual([])

    await page.getByRole('link', { name: 'Leave document' }).click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })
}
