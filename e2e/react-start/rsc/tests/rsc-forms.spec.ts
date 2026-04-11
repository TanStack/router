import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('RSC Forms Tests - Todo list with mutations', () => {
  test('Page loads with todo list visible', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')

    // Verify page title
    await expect(page.getByTestId('rsc-forms-title')).toHaveText(
      'Todo List - RSC with Forms',
    )

    // Verify form is visible
    await expect(page.getByTestId('todo-form')).toBeVisible()
    await expect(page.getByTestId('todo-input')).toBeVisible()
    await expect(page.getByTestId('add-todo-btn')).toBeVisible()
  })

  test('Add todo button is disabled when input is empty', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Verify button is disabled with empty input
    await expect(page.getByTestId('add-todo-btn')).toBeDisabled()

    // Type something
    await page.getByTestId('todo-input').fill('Test todo')

    // Now button should be enabled
    await expect(page.getByTestId('add-todo-btn')).toBeEnabled()

    // Clear input
    await page.getByTestId('todo-input').fill('')

    // Button should be disabled again
    await expect(page.getByTestId('add-todo-btn')).toBeDisabled()
  })

  test('Adding a todo refreshes the RSC', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Get initial timestamp
    const initialTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    // Add a new todo
    const todoText = `Test Todo ${Date.now()}`
    await page.getByTestId('todo-input').fill(todoText)
    await page.getByTestId('add-todo-btn').click()

    // Wait for the RSC to refetch (router.invalidate())
    await expect(page.getByTestId('todo-input')).toHaveValue('')

    // Verify timestamp changed (RSC refetched)
    const newTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()
    expect(Number(newTimestamp)).toBeGreaterThan(Number(initialTimestamp))

    // Verify input is cleared after submission
    await expect(page.getByTestId('todo-input')).toHaveValue('')
  })

  test('Todo input clears after successful submission', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Type and submit
    await page.getByTestId('todo-input').fill('Clear test todo')
    await expect(page.getByTestId('todo-input')).toHaveValue('Clear test todo')

    await page.getByTestId('add-todo-btn').click()

    // Input should be cleared
    await expect(page.getByTestId('todo-input')).toHaveValue('')
  })

  test('Form submission works via Enter key', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Get initial timestamp
    const initialTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    // Type and press Enter
    await page.getByTestId('todo-input').fill('Enter key todo')
    await page.getByTestId('todo-input').press('Enter')

    await expect(page.getByTestId('todo-input')).toHaveValue('')

    // Verify RSC refetched
    const newTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()
    expect(Number(newTimestamp)).toBeGreaterThan(Number(initialTimestamp))

    // Input should be cleared
    await expect(page.getByTestId('todo-input')).toHaveValue('')
  })

  test('Multiple todos can be added in sequence', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Add first todo
    await page.getByTestId('todo-input').fill('First todo')
    await page.getByTestId('add-todo-btn').click()
    await expect(page.getByTestId('todo-input')).toHaveValue('')

    const firstTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    // Add second todo
    await page.getByTestId('todo-input').fill('Second todo')
    await page.getByTestId('add-todo-btn').click()
    await expect(page.getByTestId('todo-input')).toHaveValue('')

    const secondTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    // Verify each addition triggered a refetch
    expect(Number(secondTimestamp)).toBeGreaterThan(Number(firstTimestamp))

    // Add third todo
    await page.getByTestId('todo-input').fill('Third todo')
    await page.getByTestId('add-todo-btn').click()
    await expect(page.getByTestId('todo-input')).toHaveValue('')

    const thirdTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    expect(Number(thirdTimestamp)).toBeGreaterThan(Number(secondTimestamp))
  })

  test('Whitespace-only input does not submit', async ({ page }) => {
    await page.goto('/rsc-forms')
    await page.waitForURL('/rsc-forms')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    // Type whitespace only
    await page.getByTestId('todo-input').fill('   ')

    // Button should still be disabled (or at least not submit)
    // Note: The implementation trims, so this might not add anything
    const initialTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    // Try to submit
    await page.getByTestId('add-todo-btn').click({ force: true })

    // Timestamp should not change for whitespace-only input
    // (depends on implementation - if trim() is used, it won't submit)
    await expect(page.getByTestId('todo-input')).toHaveValue('   ')
    const newTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()
    expect(newTimestamp).toBe(initialTimestamp)
  })
})
