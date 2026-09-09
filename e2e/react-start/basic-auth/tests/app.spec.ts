import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function signup(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
) {
  await page.goto(baseUrl + '/signup')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
}

async function login(
  page: Page,
  email: string,
  password: string,
  signupOnFail = false,
) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')

  if (signupOnFail) {
    await page.waitForSelector('text=User not found')
    await page.click('button:has-text("Sign up instead?")')
    await page.waitForSelector('text=Logout')
  }
}

test('Posts redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/posts')
  await expect(page.locator('h1')).toContainText('Login')
})

test('Login fails with user not found', async ({ page }) => {
  await login(page, 'bad@gmail.com', 'badpassword')
  await expect(page.getByText('User not found')).toBeVisible()
})

test('Login fails with incorrect password', async ({ page }) => {
  await signup(page, 'test@gmail.com', 'badpassword')
  await expect(page.getByText('Incorrect password')).toBeVisible()
})

test('Can sign up from a not found user', async ({ page }) => {
  await login(page, 'test2@gmail.com', 'badpassword', true)
  await expect(page.getByText('test2@gmail.com')).toBeVisible()
})

test('Navigating to post after logging in', async ({ page }) => {
  await login(page, 'test@gmail.com', 'test')
  await new Promise((r) => setTimeout(r, 1000))
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})
