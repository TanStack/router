import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('exact path matching', async ({ page }) => {
  const links = [
    { url: '', route: '/' },
    { url: '/', route: '/' },
    { url: '/users/profile/settings', route: '/users/profile/settings' },
    // { url: '/foo/123', route: '/foo/$bar/' },
    // { url: '/FOO/123', route: '/foo/$bar/' },
    // { url: '/foo/123/', route: '/foo/$bar/' },
    { url: '/b/123', route: '/b/$id' },
    { url: '/foo/qux', route: '/foo/{-$bar}/qux' },
    { url: '/foo/123/qux', route: '/foo/{-$bar}/qux' },
    { url: '/a/user-123', route: '/a/user-{$id}' },
    { url: '/a/123', route: '/a/$id' },
    { url: '/a/123/more', route: '/a/$' },
    { url: '/files', route: '/files/$' },
    { url: '/files/hello-world.txt', route: '/files/$' },
    { url: '/something/foo/bar', route: '/$id/foo/bar' },
    { url: '/files/deep/nested/file.json', route: '/files/$' },
    { url: '/files/', route: '/files/$' },
    { url: '/images/thumb_200x300.jpg', route: '/images/thumb_{$}' },
    { url: '/logs/2020/01/01/error.txt', route: '/logs/{$}.txt' },
    { url: '/cache/temp_user456.log', route: '/cache/temp_{$}.log' },
    { url: '/a/b/c/d/e', route: '/a/$' },
  ]
  for (const link of links) {
    await test.step(`nav to '${link.url}'`, async () => {
      console.log(`nav to '${link.url}'`)
      await page.goto(link.url)
      await expect(page.getByText(`Hello "${link.route}"!`)).toBeVisible()
    })
  }
})
