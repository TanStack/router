import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '../checkpoints/05-authentication/src/generated/prisma/client'
const databaseUrl = process.env.AUTH_DATABASE_URL
if (!databaseUrl) {
  throw new Error('Set AUTH_DATABASE_URL for the account checkpoint')
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})
test.afterAll(async () => {
  await db.$disconnect()
})

test('accounts isolate drafts and mutations while publishing is explicit', async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  const id = randomUUID()
  const aliceEmail = `alice-${id}@example.test`
  const bobEmail = `bob-${id}@example.test`
  const password = `course-password-${id}`
  const slug = `private-${id}`
  const category = `auth-${id.slice(0, 8)}`
  const title = `Private note ${id}`
  const body = `Only its owner should read this draft ${id}`
  const bobContext = await browser.newContext({ baseURL })
  const bob = await bobContext.newPage()
  try {
    expect(
      (await request.get('/dashboard', { maxRedirects: 0 })).headers()[
        'cache-control'
      ],
    ).toContain('no-store')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await page
      .getByRole('button', { name: 'Create an account', exact: true })
      .click()
    await page.getByLabel('Name', { exact: true }).fill('Alice')
    await page.getByLabel('Email', { exact: true }).fill(aliceEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await page.getByLabel('Title', { exact: true }).fill(title)
    await page.getByLabel('Body', { exact: true }).fill(body)
    await page.getByLabel('Category', { exact: true }).fill(category)
    await page.getByRole('button', { name: 'Create note', exact: true }).click()
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toBeVisible()
    expect((await request.get(`/notes/${slug}`)).status()).toBe(404)
    expect(await (await request.get('/')).text()).not.toContain(title)

    const alice = await db.user.findUniqueOrThrow({
      where: { email: aliceEmail },
    })
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const renewed = await page.reload()
    expect(renewed).not.toBeNull()
    expect((await renewed?.allHeaders())?.['set-cookie']).toContain(
      'session_token',
    )

    const privateRead = page.waitForResponse(
      async (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.startsWith('/_serverFn/') &&
        (await response.text()).includes(body),
    )
    await page.getByRole('link', { name: title, exact: true }).click()
    const readRequest = (await privateRead).request()
    await expect(page.getByText(body, { exact: true })).toBeVisible()
    const privateResponse = await page.reload()
    expect(privateResponse?.headers()['cache-control']).toContain('no-store')
    await expect(page.getByText(body, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'My notes', exact: true }).click()

    const publishRequestPromise = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        new URL(r.url()).pathname.startsWith('/_serverFn/'),
    )
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    const publishRequest = await publishRequestPromise
    await expect(
      page.getByRole('button', { name: 'Unpublish', exact: true }),
    ).toBeVisible()
    expect(await (await request.get(`/notes/${slug}`)).text()).toContain(body)
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Publish', exact: true }),
    ).toBeEnabled()
    expect((await request.get(`/notes/${slug}`)).status()).toBe(404)

    const publishHeaders = await publishRequest.allHeaders()
    delete publishHeaders.cookie
    delete publishHeaders['content-length']
    const crossSite = await page.request.post(publishRequest.url(), {
      headers: {
        ...publishHeaders,
        origin: 'https://untrusted.example',
        'sec-fetch-site': 'cross-site',
      },
      data: publishRequest.postData() ?? '',
    })
    expect(crossSite.status()).toBe(403)
    expect((await request.get(`/notes/${slug}`)).status()).toBe(404)

    await bob.goto('/login')
    await bob
      .getByRole('button', { name: 'Create an account', exact: true })
      .click()
    await bob.getByLabel('Name', { exact: true }).fill('Bob')
    await bob.getByLabel('Email', { exact: true }).fill(bobEmail)
    await bob.getByLabel('Password', { exact: true }).fill(password)
    await bob
      .getByRole('button', { name: 'Create account', exact: true })
      .click()
    await expect(bob).toHaveURL(/\/dashboard$/)
    await expect(
      bob.getByRole('link', { name: title, exact: true }),
    ).toHaveCount(0)
    const foreignWrite = await bobContext.request.post(publishRequest.url(), {
      headers: publishHeaders,
      data: publishRequest.postData() ?? '',
    })
    expect(foreignWrite.status()).toBe(404)
    const readHeaders = await readRequest.allHeaders()
    delete readHeaders.cookie
    const foreignRead = await bobContext.request.get(readRequest.url(), {
      headers: readHeaders,
    })
    expect(await foreignRead.text()).not.toContain(body)
    expect((await bob.goto(`/drafts/${slug}`))?.status()).toBe(404)
    expect((await request.get(`/notes/${slug}`)).status()).toBe(404)

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    const signedOutWrite = await page.request.post(publishRequest.url(), {
      headers: publishHeaders,
      data: publishRequest.postData() ?? '',
    })
    expect(signedOutWrite.status()).toBe(401)
    expect(
      (
        await page.request.get(readRequest.url(), { headers: readHeaders })
      ).status(),
    ).toBe(401)
    await page.getByLabel('Email', { exact: true }).fill(aliceEmail)
    await page
      .getByLabel('Password', { exact: true })
      .fill('wrong-password-value')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Invalid email or password.',
    )
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toBeVisible()
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  } finally {
    await bobContext.close()
    await db.user.deleteMany({
      where: { email: { in: [aliceEmail, bobEmail] } },
    })
    await db.category.deleteMany({ where: { name: category } })
  }
})
