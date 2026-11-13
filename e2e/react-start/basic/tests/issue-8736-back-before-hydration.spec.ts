import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'

test.skip(isSpaMode, 'issue #8736 needs server-rendered markup to hydrate')

// https://github.com/TanStack/router/issues/8736
test('Back before hydration hydrates the server markup, then shows the current entry', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!!!' }),
  ).toBeVisible()

  // A client navigation creates the `/posts` entry with pushState, so `/` and
  // `/posts` share the document that the reload below creates.
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await page.waitForURL('/posts')
  await expect(page.getByTestId('PostsIndexComponent')).toBeVisible()

  // Hold the bundled client scripts so the reloaded document stays
  // unhydrated. The app's own public scripts (`/head-script.js`, ...) include a
  // blocking one in <head>, so they load as usual.
  const isBundledScript = (url: URL) =>
    /\.m?js$/.test(url.pathname) && url.pathname.split('/').length > 2
  const held: Array<() => Promise<void>> = []
  await page.route(isBundledScript, (route) => {
    held.push(() => route.continue())
  })

  await page.reload({ waitUntil: 'commit' })
  await expect(page.getByTestId('PostsIndexComponent')).toBeVisible()

  // Back fires `popstate` on the same document before any script has run.
  await page.goBack({ waitUntil: 'commit' })
  // Not `waitForURL`: it waits for `load`, which can't fire while scripts are held.
  await expect(page).toHaveURL(/\/$/)

  await Promise.all(held.map((resume) => resume()))
  await page.unroute(isBundledScript)

  await expect(
    page.getByRole('heading', { name: 'Welcome Home!!!' }),
  ).toBeVisible()
  await expect(page.getByTestId('PostsIndexComponent')).toHaveCount(0)
  // One app shell: the root layout's navigation is rendered once.
  await expect(
    page.getByRole('link', { name: 'Posts', exact: true }),
  ).toHaveCount(1)

  // The hydrated app handles client navigation.
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await page.waitForURL('/posts')
  await expect(page.getByTestId('PostsIndexComponent')).toHaveCount(1)
})
