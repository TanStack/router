import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '../checkpoints/04-forms/src/generated/prisma/client'
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
test.afterAll(async () => {
  await db.$disconnect()
})

test('loader renders persisted notes and a failed write rolls back its category', async ({
  page,
  request,
}) => {
  const slug = randomUUID()
  const category = `cat-${slug.slice(0, 8)}`
  const rolledBack = `rollback-${slug.slice(0, 8)}`
  try {
    await page.goto('/')
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await page.getByLabel('Title', { exact: true }).fill(`Note ${slug}`)
    await page.getByLabel('Category', { exact: true }).fill(category)
    await page
      .getByLabel('Body', { exact: true })
      .fill('A persisted course note.')
    const mutation = page.waitForRequest(
      (request) => request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Create note', exact: true }).click()
    await expect(
      page.getByRole('listitem').filter({ hasText: `Note ${slug}` }),
    ).toBeVisible()
    const savedRequest = await mutation
    const headers = await savedRequest.allHeaders()
    delete headers['content-length']
    headers.origin = 'https://untrusted.example'
    headers['sec-fetch-site'] = 'cross-site'
    const rejected = await request.post(savedRequest.url(), {
      headers,
      data: savedRequest.postData() ?? '',
    })
    expect(rejected.status()).toBe(403)
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`Note ${slug}`)
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('Set DATABASE_URL for the database tests')
    }
    expect(html).not.toContain(databaseUrl)
    const password = new URL(databaseUrl).password
    if (password) {
      expect(html).not.toContain(password)
    }
    expect(response.headers()['cache-control']).toContain('no-store')
    await page.reload()
    await expect(
      page.getByRole('listitem').filter({ hasText: `Note ${slug}` }),
    ).toBeVisible()

    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await page.getByLabel('Title', { exact: true }).fill('Duplicate')
    await page.getByLabel('Category', { exact: true }).fill(rolledBack)
    await page.getByLabel('Body', { exact: true }).fill('Duplicate note body.')
    await page.getByRole('button', { name: 'Create note', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'That slug is already used. Choose another one.',
    )
    expect(
      await db.category.findUnique({ where: { name: rolledBack } }),
    ).toBeNull()
    expect(await db.note.findUnique({ where: { slug } })).toMatchObject({
      title: `Note ${slug}`,
      categoryName: category,
    })
  } finally {
    await db.note.deleteMany({ where: { slug } })
    await db.category.deleteMany({
      where: { name: { in: [category, rolledBack] } },
    })
  }
})

test('server validation rejects whitespace titles before a write', async ({
  page,
}) => {
  const slug = randomUUID()
  const category = `invalid-${slug.slice(0, 8)}`
  try {
    await page.goto('/')
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await page.getByLabel('Title', { exact: true }).fill('   ')
    await page.getByLabel('Category', { exact: true }).fill(category)
    await page
      .getByLabel('Body', { exact: true })
      .fill('A persisted course note.')
    await page.getByRole('button', { name: 'Create note', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Could not save. Check your input and try again.',
    )
    expect(await db.note.findUnique({ where: { slug } })).toBeNull()
    expect(
      await db.category.findUnique({ where: { name: category } }),
    ).toBeNull()
  } finally {
    await db.note.deleteMany({ where: { slug } })
    await db.category.deleteMany({ where: { name: category } })
  }
})
