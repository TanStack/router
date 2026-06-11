import { expect, test } from '@playwright/test'

// https://github.com/TanStack/router/issues/7602
test('context value from beforeLoad is propagated to a sub-route while the loader of the sub-route is executing', async ({
  page,
}) => {
  await page.goto('/context-propagation')
  await expect(page.getByTestId('context-propagation-result')).toHaveText(
    'number = 42, saw undefined = false',
  )

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')

  await page.goBack()

  // the component must never render with an undefined context value
  // while the loader is executing
  await expect(page.getByTestId('context-propagation-result')).toHaveText(
    'number = 42, saw undefined = false',
  )
})
