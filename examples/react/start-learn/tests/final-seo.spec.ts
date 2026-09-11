import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '../checkpoints/08-tests/src/generated/prisma/client'
const databaseUrl = process.env.AUTH_DATABASE_URL
if (!databaseUrl) {
  throw new Error('Set AUTH_DATABASE_URL for the SEO checkpoint')
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})
test.afterAll(async () => {
  await db.$disconnect()
})
test('published HTML has metadata and sitemap entries while drafts stay private', async ({
  browser,
  request,
  baseURL,
}) => {
  const id = randomUUID()
  const published = `published-${id}`
  const draft = `draft-${id}`
  const category = `seo-${id}`
  const title = `Notes & "quotes" ${id}`
  const body =
    'A note with </script><script>document.documentElement.dataset.injected="yes"</script> & ordinary text.'
  const context = await browser.newContext({
    javaScriptEnabled: false,
    userAgent: 'facebookexternalhit/1.1',
    baseURL,
  })
  const page = await context.newPage()
  const jsContext = await browser.newContext({ baseURL })
  const jsPage = await jsContext.newPage()
  try {
    await db.category.create({ data: { name: category } })
    await db.note.createMany({
      data: [
        {
          slug: published,
          title,
          body,
          categoryName: category,
          isPublished: true,
        },
        {
          slug: draft,
          title: `Hidden ${id}`,
          body: `Secret ${id}`,
          categoryName: category,
        },
      ],
    })
    const response = await page.goto(`/notes/${published}?utm_source=test`)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(`${title} | Field notes`)
    await expect(page.locator('head title')).toHaveCount(1)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      body,
    )
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${baseURL}/notes/${published}`,
    )
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${baseURL}/notes/${published}`,
    )
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText(body, { exact: true })).toBeVisible()
    const html = await (await request.get(`/notes/${published}`)).text()
    expect(html).not.toContain(databaseUrl)
    expect(html).not.toContain(process.env.BETTER_AUTH_SECRET)
    const structured = page.locator('head script[type="application/ld+json"]')
    await expect(structured).toHaveCount(1)
    expect(JSON.parse((await structured.textContent())!)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: title,
      description: body,
      url: `${baseURL}/notes/${published}`,
    })
    expect(html).not.toContain(
      '<script>document.documentElement.dataset.injected',
    )
    const imageUrl = `${baseURL}/images/field-notes-v1.png`
    await expect(
      page.locator('head meta[property="og:image"]'),
    ).toHaveAttribute('content', imageUrl)
    await expect(
      page.locator('head meta[name="twitter:image"]'),
    ).toHaveAttribute('content', imageUrl)
    await expect(
      page.locator('head meta[name="twitter:title"]'),
    ).toHaveAttribute('content', `${title} | Field notes`)
    await expect(
      page.locator('head meta[property="og:image:width"]'),
    ).toHaveAttribute('content', '1200')
    await expect(
      page.locator('head meta[property="og:image:height"]'),
    ).toHaveAttribute('content', '630')
    const image = await request.get(imageUrl, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    })
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toContain('image/png')
    const bytes = await image.body()
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(1200)
    expect(bytes.readUInt32BE(20)).toBe(630)
    const moved = await request.get(`/old-notes/${published}`, {
      maxRedirects: 0,
    })
    expect(moved.status()).toBe(308)
    expect(moved.headers().location).toBe(`/notes/${published}`)
    expect(moved.headers()['cache-control']).toContain('no-store')
    expect(
      (await request.get(`/old-notes/${draft}`, { maxRedirects: 0 })).status(),
    ).toBe(404)
    expect(
      (
        await request.get('/old-notes/missing-seo-course-note', {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404)

    await jsPage.goto('/')
    await jsPage.getByRole('link', { name: title, exact: true }).click()
    await expect(jsPage).toHaveURL(`${baseURL}/notes/${published}`)
    await expect(
      jsPage.locator('head script[type="application/ld+json"]'),
    ).toHaveCount(1)
    expect(
      await jsPage.locator('html').getAttribute('data-injected'),
    ).toBeNull()
    await expect(jsPage.getByText(body, { exact: true })).toBeVisible()
    await jsPage.getByRole('link', { name: 'All notes', exact: true }).click()
    await expect(
      jsPage.locator('head script[type="application/ld+json"]'),
    ).toHaveCount(0)
    await jsPage.goto(`/notes/${published}`)
    expect(
      await jsPage.locator('html').getAttribute('data-injected'),
    ).toBeNull()

    const sitemap = await request.get('/sitemap.txt')
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()['content-type']).toContain('text/plain')
    const urls = (await sitemap.text()).trim().split('\n')
    expect(urls).toContain(`${baseURL}/`)
    expect(urls).toContain(`${baseURL}/notes/${published}`)
    expect(urls).not.toContain(`${baseURL}/notes/${draft}`)
    expect(urls.some((url) => url.includes('/old-notes/'))).toBe(false)
    for (const url of urls) {
      expect((await page.goto(url))?.status()).toBe(200)
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        url,
      )
    }
    expect(
      urls.every(
        (url) =>
          !url.includes('?') &&
          !url.includes('/dashboard') &&
          !url.includes('/drafts/'),
      ),
    ).toBe(true)
    expect(await (await request.get('/robots.txt')).text()).toContain(
      `Sitemap: ${baseURL}/sitemap.txt`,
    )
    await page.goto(`/?q=${id}`)
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    )
    await expect(page.getByRole('link', { name: title })).toHaveAttribute(
      'href',
      `/notes/${published}`,
    )
    await expect(page.getByText(`Hidden ${id}`, { exact: true })).toHaveCount(0)
    expect((await page.goto(`/notes/${draft}`))?.status()).toBe(404)
    expect((await request.get('/notes/missing-seo-course-note')).status()).toBe(
      404,
    )
    await db.note.update({
      where: { slug: published },
      data: { isPublished: false },
    })
    expect((await request.get(`/notes/${published}`)).status()).toBe(404)
    expect(await (await request.get('/sitemap.txt')).text()).not.toContain(
      published,
    )
    const dashboard = await request.get('/dashboard', { maxRedirects: 0 })
    expect(dashboard.headers()['cache-control']).toContain('no-store')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    )
  } finally {
    await context.close()
    await jsContext.close()
    await db.note.deleteMany({ where: { slug: { in: [published, draft] } } })
    await db.category.deleteMany({ where: { name: category } })
  }
})
