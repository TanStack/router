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

    const { rootBeforeLoad, targetBeforeLoad } = await page.evaluate(() => {
      const rootBeforeLoads =
        (globalThis as any).__issue4614RootBeforeLoads ?? []
      return {
        rootBeforeLoad: rootBeforeLoads.at(-1),
        targetBeforeLoad: (globalThis as any).__issue4614TargetBeforeLoad,
      }
    })

    expect(targetBeforeLoad).toMatchObject({
      cause: 'preload',
      preload: true,
      scenario: 'cached',
    })
    expect(targetBeforeLoad.rootContext).toBe(rootBeforeLoad?.root ?? 'server')
    expect(targetBeforeLoad.issue4614Context).toBe(
      rootBeforeLoad?.issue4614Context ?? 'server:cached',
    )
  })

  test('child receives fresh parent context when loaderDeps force a same-preload reload', async ({
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
