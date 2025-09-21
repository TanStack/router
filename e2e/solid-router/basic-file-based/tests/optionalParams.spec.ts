import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('ensure paths with optional params are resolved correctly', () => {
  test('simple optional param usage', async ({ page }) => {
    await page.goto('/optional-params')
    let pagePathname = ''

    const simpleIndexLink = page.getByTestId('l-to-simple-index')
    const simpleIdIndexLink = page.getByTestId('l-to-simple-id-index')
    const simplePathLink = page.getByTestId('l-to-simple-path')
    const simpleIdPathLink = page.getByTestId('l-to-simple-id-path')

    await expect(simpleIndexLink).toHaveAttribute(
      'href',
      '/optional-params/simple',
    )
    await expect(simpleIdIndexLink).toHaveAttribute(
      'href',
      '/optional-params/simple/id',
    )
    await expect(simplePathLink).toHaveAttribute(
      'href',
      '/optional-params/simple/path',
    )
    await expect(simpleIdPathLink).toHaveAttribute(
      'href',
      '/optional-params/simple/id/path',
    )

    await simpleIndexLink.click()
    await page.waitForURL('/optional-params/simple')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/simple')
    await expect(page.getByTestId('simple-index-heading')).toBeInViewport()
    expect(await page.getByTestId('simple-index-params').innerText()).toEqual(
      JSON.stringify({}),
    )

    await simpleIdIndexLink.click()
    await page.waitForURL('/optional-params/simple/id')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/simple/id')
    await expect(page.getByTestId('simple-index-heading')).toBeInViewport()
    expect(await page.getByTestId('simple-index-params').innerText()).toEqual(
      JSON.stringify({ id: 'id' }),
    )

    await simplePathLink.click()
    await page.waitForURL('/optional-params/simple/path')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/simple/path')
    await expect(page.getByTestId('simple-path-heading')).toBeInViewport()
    expect(await page.getByTestId('simple-path-params').innerText()).toEqual(
      JSON.stringify({}),
    )

    await simpleIdPathLink.click()
    await page.waitForURL('/optional-params/simple/id/path')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/simple/id/path')
    await expect(page.getByTestId('simple-path-heading')).toBeInViewport()
    expect(await page.getByTestId('simple-path-params').innerText()).toEqual(
      JSON.stringify({ id: 'id' }),
    )
  })

  test('with index pages, path params and optional params', async ({
    page,
  }) => {
    await page.goto('/optional-params')
    let pagePathname = ''

    const withIndexCategoryLink = page.getByTestId(
      'l-to-withIndex-category-index',
    )
    const withIndexIdCategoryLink = page.getByTestId(
      'l-to-withIndex-id-category-index',
    )
    const withIndexCategoryPathLink = page.getByTestId(
      'l-to-withIndex-category-path',
    )
    const withIndexIdCategoryPathLink = page.getByTestId(
      'l-to-withIndex-id-category-path',
    )

    await expect(withIndexCategoryLink).toHaveAttribute(
      'href',
      '/optional-params/withIndex/category',
    )
    await expect(withIndexIdCategoryLink).toHaveAttribute(
      'href',
      '/optional-params/withIndex/id/category',
    )
    await expect(withIndexCategoryPathLink).toHaveAttribute(
      'href',
      '/optional-params/withIndex/category/path',
    )
    await expect(withIndexIdCategoryPathLink).toHaveAttribute(
      'href',
      '/optional-params/withIndex/id/category/path',
    )

    await withIndexCategoryLink.click()
    await page.waitForURL('/optional-params/withIndex/category')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/withIndex/category')
    await expect(page.getByTestId('withIndex-index-heading')).toBeInViewport()
    expect(
      await page.getByTestId('withIndex-index-params').innerText(),
    ).toEqual(JSON.stringify({ category: 'category' }))

    await withIndexIdCategoryLink.click()
    await page.waitForURL('/optional-params/withIndex/id/category')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/withIndex/id/category')
    await expect(page.getByTestId('withIndex-index-heading')).toBeInViewport()
    expect(
      await page.getByTestId('withIndex-index-params').innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category' }))

    await withIndexCategoryPathLink.click()
    await page.waitForURL('/optional-params/withIndex/category/path')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/withIndex/category/path')
    await expect(page.getByTestId('withIndex-path-heading')).toBeInViewport()
    expect(await page.getByTestId('withIndex-path-params').innerText()).toEqual(
      JSON.stringify({ category: 'category' }),
    )

    await withIndexIdCategoryPathLink.click()
    await page.waitForURL('/optional-params/withIndex/id/category/path')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/withIndex/id/category/path')
    await expect(page.getByTestId('withIndex-path-heading')).toBeInViewport()
    expect(await page.getByTestId('withIndex-path-params').innerText()).toEqual(
      JSON.stringify({ id: 'id', category: 'category' }),
    )
  })

  test('with consecutive optional params', async ({ page }) => {
    await page.goto('/optional-params')
    let pagePathname = ''

    const withNoOptionalsLink = page.getByTestId(
      'l-to-consecutive-category-info',
    )
    const withOptionalIdLink = page.getByTestId(
      'l-to-consecutive-id-category-info',
    )
    const withOptionalSlugLink = page.getByTestId(
      'l-to-consecutive-slug-category-info',
    )
    const withOptionalIdSlugLink = page.getByTestId(
      'l-to-consecutive-id-slug-category-info',
    )

    await expect(withNoOptionalsLink).toHaveAttribute(
      'href',
      '/optional-params/consecutive/category/info',
    )
    await expect(withOptionalIdLink).toHaveAttribute(
      'href',
      '/optional-params/consecutive/id/category/info',
    )
    await expect(withOptionalSlugLink).toHaveAttribute(
      'href',
      '/optional-params/consecutive/slug/category/info',
    )
    await expect(withOptionalIdSlugLink).toHaveAttribute(
      'href',
      '/optional-params/consecutive/id/slug/category/info',
    )

    await withNoOptionalsLink.click()
    await page.waitForURL('/optional-params/consecutive/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/consecutive/category/info')
    await expect(page.getByTestId('consecutive-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('consecutive-id-slug-category-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ category: 'category' }))

    await withOptionalIdLink.click()
    await page.waitForURL('/optional-params/consecutive/id/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/consecutive/id/category/info')
    await expect(page.getByTestId('consecutive-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('consecutive-id-slug-category-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category' }))

    await withOptionalSlugLink.click()
    await page.waitForURL('/optional-params/consecutive/slug/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/optional-params/consecutive/slug/category/info')
    await expect(page.getByTestId('consecutive-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('consecutive-id-slug-category-info-params')
        .innerText(),
    ).not.toEqual(JSON.stringify({ slug: 'slug', category: 'category' }))

    expect(
      await page
        .getByTestId('consecutive-id-slug-category-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'slug', category: 'category' }))

    await withOptionalIdSlugLink.click()
    await page.waitForURL('/optional-params/consecutive/id/slug/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/consecutive/id/slug/category/info',
    )
    await expect(page.getByTestId('consecutive-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('consecutive-id-slug-category-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', slug: 'slug', category: 'category' }))
  })

  test('with required path between optional params', async ({ page }) => {
    await page.goto('/optional-params')
    let pagePathname = ''

    const withNoOptionalsLink = page.getByTestId(
      'l-to-withRequiredInBetween-category',
    )
    const withOptionalIdLink = page.getByTestId(
      'l-to-withRequiredInBetween-id-category',
    )
    const withOptionalSlugLink = page.getByTestId(
      'l-to-withRequiredInBetween-category-slug',
    )
    const withOptionalIdSlugLink = page.getByTestId(
      'l-to-withRequiredInBetween-id-category-slug',
    )

    await expect(withNoOptionalsLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredInBetween/category/path',
    )
    await expect(withOptionalIdLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredInBetween/id/category/path',
    )
    await expect(withOptionalSlugLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredInBetween/category/path/slug',
    )
    await expect(withOptionalIdSlugLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredInBetween/id/category/path/slug',
    )

    await withNoOptionalsLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredInBetween/category/path',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredInBetween/category/path',
    )
    await expect(
      page.getByTestId('withRequiredInBetween-heading'),
    ).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredInBetween-id-category-path-slug-params')
        .innerText(),
    ).toEqual(JSON.stringify({ category: 'category' }))

    await withOptionalIdLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredInBetween/id/category/path',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredInBetween/id/category/path',
    )
    await expect(
      page.getByTestId('withRequiredInBetween-heading'),
    ).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredInBetween-id-category-path-slug-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category' }))

    await withOptionalSlugLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredInBetween/category/path/slug',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredInBetween/category/path/slug',
    )
    await expect(
      page.getByTestId('withRequiredInBetween-heading'),
    ).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredInBetween-id-category-path-slug-params')
        .innerText(),
    ).toEqual(JSON.stringify({ category: 'category', slug: 'slug' }))

    await withOptionalIdSlugLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredInBetween/id/category/path/slug',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredInBetween/id/category/path/slug',
    )
    await expect(
      page.getByTestId('withRequiredInBetween-heading'),
    ).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredInBetween-id-category-path-slug-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category', slug: 'slug' }))
  })

  test('with required params between optional params', async ({ page }) => {
    await page.goto('/optional-params')
    let pagePathname = ''

    const withNoOptionalsLink = page.getByTestId(
      'l-to-withRequiredParam-category',
    )
    const withOptionalIdLink = page.getByTestId(
      'l-to-withRequiredParam-id-category',
    )
    const withOptionalSlugLink = page.getByTestId(
      'l-to-withRequiredParam-category-slug',
    )
    const withOptionalIdSlugLink = page.getByTestId(
      'l-to-withRequiredParam-id-category-slug',
    )

    await expect(withNoOptionalsLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredParam/category/info',
    )
    await expect(withOptionalIdLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredParam/id/category/info',
    )
    await expect(withOptionalSlugLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredParam/category/slug/info',
    )
    await expect(withOptionalIdSlugLink).toHaveAttribute(
      'href',
      '/optional-params/withRequiredParam/id/category/slug/info',
    )

    await withNoOptionalsLink.click()
    await page.waitForURL('/optional-params/withRequiredParam/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredParam/category/info',
    )
    await expect(page.getByTestId('withRequiredParam-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredParam-id-category-slug-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ category: 'category' }))

    await withOptionalIdLink.click()
    await page.waitForURL('/optional-params/withRequiredParam/id/category/info')
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredParam/id/category/info',
    )
    await expect(page.getByTestId('withRequiredParam-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredParam-id-category-slug-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category' }))

    await withOptionalSlugLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredParam/category/slug/info',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredParam/category/slug/info',
    )
    await expect(page.getByTestId('withRequiredParam-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredParam-id-category-slug-info-params')
        .innerText(),
    ).not.toEqual(JSON.stringify({ category: 'category', slug: 'slug' }))

    expect(
      await page
        .getByTestId('withRequiredParam-id-category-slug-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'category', category: 'slug' }))

    await withOptionalIdSlugLink.click()
    await page.waitForURL(
      '/optional-params/withRequiredParam/id/category/slug/info',
    )
    pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe(
      '/optional-params/withRequiredParam/id/category/slug/info',
    )
    await expect(page.getByTestId('withRequiredParam-heading')).toBeInViewport()
    expect(
      await page
        .getByTestId('withRequiredParam-id-category-slug-info-params')
        .innerText(),
    ).toEqual(JSON.stringify({ id: 'id', category: 'category', slug: 'slug' }))
  })
})
