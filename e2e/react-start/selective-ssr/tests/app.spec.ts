import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const testCount = 7

test.describe('selective ssr', () => {
  test('#4614: ssr false child receives context from its parent load generation', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('issue-4614-cached-link').hover()

    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614TargetBeforeLoad),
      )
      .not.toBeUndefined()

    const { rootBeforeLoads, targetBeforeLoad } = await page.evaluate(() => {
      const rootBeforeLoads =
        (globalThis as any).__issue4614RootBeforeLoads ?? []
      return {
        rootBeforeLoads,
        targetBeforeLoad: (globalThis as any).__issue4614TargetBeforeLoad,
      }
    })

    expect(rootBeforeLoads).toEqual([])
    expect(targetBeforeLoad).toEqual({
      cause: 'preload',
      preload: true,
      rootContext: 'server',
      issue4614Context: 'server:cached',
      scenario: 'cached',
    })
  })

  test('new loaderDeps match generation propagates fresh parent context to child (control)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('issue-4614-reload-link').hover()

    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614RootBeforeLoads),
      )
      .toEqual([
        {
          cause: 'preload',
          preload: true,
          root: 'client',
          issue4614Context: 'client:reload',
        },
      ])
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614TargetBeforeLoad),
      )
      .toEqual({
        cause: 'preload',
        preload: true,
        rootContext: 'client',
        issue4614Context: 'client:reload',
        scenario: 'reload',
      })
  })

  test('testcount matches', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)
  })

  for (let i = 0; i < testCount; i++) {
    test(`run test ${i}`, async ({ page }) => {
      await page.goto('/')
      const testId = `testcase-${i}-link`
      await page.getByTestId(testId).click()

      // wait for page to be loaded by waiting for the leaf route to be rendered
      await expect(page.getByTestId('postId-heading')).toContainText('postId')

      // check expectations
      await Promise.all(
        ['root', 'posts', 'postId'].map(async (route) => {
          const expectedData = await page
            .getByTestId(`${route}-data-expected`)
            .textContent()
          expect(expectedData).not.toBeNull()
          await expect(page.getByTestId(`${route}-loader`)).toContainText(
            expectedData!,
          )
          await expect(page.getByTestId(`${route}-context`)).toContainText(
            expectedData!,
          )
        }),
      )
      await expect(page.getByTestId('router-isLoading')).toContainText('false')
      await expect(page.getByTestId('router-status')).toContainText('idle')
    })
  }
})
