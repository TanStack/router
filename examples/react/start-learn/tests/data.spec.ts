import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '../checkpoints/03-data/src/generated/prisma/client'
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Set DATABASE_URL for the database checkpoint')
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})
test.afterAll(async () => {
  await db.$disconnect()
})
test('loaders read PostgreSQL and preserve filtering, detail data and 404s', async ({
  request,
  page,
}) => {
  const slug = randomUUID()
  const category = `data-${slug.slice(0, 8)}`
  try {
    await db.category.create({ data: { name: category } })
    await db.note.create({
      data: {
        slug,
        title: `Database ${slug}`,
        body: 'Read this value from PostgreSQL.',
        categoryName: category,
      },
    })
    const response = await request.get(`/?q=${slug}`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`Database ${slug}`)
    expect(html).not.toContain(databaseUrl)
    await page.goto(`/?q=${slug}`)
    await page.getByRole('link', { name: `Database ${slug}` }).click()
    await expect(
      page.getByText('Read this value from PostgreSQL.', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: `Database ${slug}` }),
    ).toBeVisible()
    expect((await request.get('/notes/missing-course-note')).status()).toBe(404)
    expect((await request.get(`/notes/${'x'.repeat(81)}`)).status()).toBe(404)
  } finally {
    await db.note.deleteMany({ where: { slug } })
    await db.category.deleteMany({ where: { name: category } })
  }
})
