import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import crypto from 'node:crypto'
import path from 'node:path'
import type { APIRequestContext, Page } from '@playwright/test'

const isDev = process.env.MODE === 'dev'
const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'
const isVite = toolchain === 'vite'
const hmrExpect = expect.configure({ timeout: 20_000 })
const componentsRouteFile = path.join(
  process.cwd(),
  'src/routes/components.tsx',
)
const interactiveBoxLabelSource =
  '      {props.label}: <span data-testid={`${props.id}-count`}>{count}</span>'
const interactiveBoxHmrLabelSource =
  '      hmr {props.label}: <span data-testid={`${props.id}-count`}>{count}</span>'

function normalizeComponentsRouteSource(source: string) {
  return source
    .split(interactiveBoxHmrLabelSource)
    .join(interactiveBoxLabelSource)
}

const componentsRouteEditor = createHmrFileEditor({
  files: {
    componentsRoute: componentsRouteFile,
  },
  normalizeSource: (_fileKey, source) => normalizeComponentsRouteSource(source),
})

function getVisibleHydrateVirtualPath() {
  const normalizedSourcePath = path
    .relative(process.cwd(), componentsRouteFile)
    .replaceAll('\\', '/')
  const sourceHash = crypto
    .createHash('sha1')
    .update(normalizedSourcePath)
    .digest('hex')
    .slice(0, 10)
  const params = new URLSearchParams()
  params.set('tss-hydrate', `0_${sourceHash}`)

  return `${componentsRouteFile}?${params.toString()}`
}

async function waitForVisibleHydrateVirtualModule(page: Page, marker: string) {
  const virtualPath = getVisibleHydrateVirtualPath()

  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(virtualPath)
          const text = await response.text()

          if (response.ok() && text.includes(marker)) {
            return 'ready'
          }

          return `${response.status()} ${text.slice(0, 240)}`
        } catch (error) {
          return String(error)
        }
      },
      { timeout: 20_000 },
    )
    .toBe('ready')
}

async function clickAndExpectCount(
  page: Page,
  buttonTestId: string,
  countTestId: string,
  count: string,
) {
  await expect(page.getByTestId(buttonTestId)).toHaveAttribute(
    'data-hydrated',
    'true',
  )
  await page.getByTestId(buttonTestId).click()
  await expect(page.getByTestId(countTestId)).toHaveText(count)
}

async function hoverIntentAndExpectCount(
  page: Page,
  buttonTestId: string,
  countTestId: string,
  count: string,
) {
  await expectRouteToStayUnhydrated(page, buttonTestId)
  await page.mouse.move(0, 0)
  await page.getByTestId(buttonTestId).hover()
  await clickAndExpectCount(page, buttonTestId, countTestId, count)
}

async function dispatchHydrationIntent(
  page: Page,
  buttonTestId: string,
  eventName: string,
) {
  await page.getByTestId(buttonTestId).evaluate((element, eventName) => {
    const marker = element.closest('[data-ts-hydrate-id]')

    if (!marker) {
      throw new Error('Expected Hydrate marker to exist')
    }

    marker.dispatchEvent(
      new Event(eventName, { bubbles: true, cancelable: true }),
    )
  }, eventName)
}

async function expectRouteToStayUnhydrated(
  page: Page,
  buttonTestId: string,
  duration = 250,
) {
  await expect(page.getByTestId(buttonTestId)).toHaveAttribute(
    'data-hydrated',
    'false',
  )
  await page.waitForTimeout(duration)
  await expect(page.getByTestId(buttonTestId)).toHaveAttribute(
    'data-hydrated',
    'false',
  )
}

async function scrollToBoundary(page: Page, buttonTestId: string) {
  const button = page.getByTestId(buttonTestId)
  for (let attempt = 0; attempt < 3; attempt++) {
    await button.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' })
    })

    await page.waitForTimeout(100)
    const isVisible = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < window.innerHeight
    })

    if (isVisible) return
  }

  await expect(button).toBeInViewport()
}

async function expectCssProperty(
  page: Page,
  testId: string,
  property: string,
  value: string,
) {
  await expect
    .poll(() =>
      page.getByTestId(testId).evaluate((element, propertyName) => {
        return getComputedStyle(element).getPropertyValue(propertyName)
      }, property),
    )
    .toBe(value)
}

function htmlContainsText(html: string, text: string) {
  const pattern = text.split(' ').join('(?:\\s|<!-- -->)+')
  expect(html).toMatch(new RegExp(pattern))
}

async function waitForComponentsServerHtmlText(page: Page, text: string) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/components')
        const html = await response.text()

        if (!response.ok()) {
          return `${response.status()} ${html.slice(0, 240)}`
        }

        try {
          htmlContainsText(html, text)
          return 'ready'
        } catch {
          return html.slice(0, 240)
        }
      },
      { timeout: 20_000 },
    )
    .toBe('ready')
}

function getModulePreloadHrefs(html: string) {
  return Array.from(html.matchAll(/<link\b[^>]*>/g), (match) => match[0])
    .filter((tag) => /\brel="modulepreload"/.test(tag))
    .map((tag) => tag.match(/\bhref="([^"]+)"/)?.[1])
    .filter((href): href is string => !!href)
}

async function modulePreloadContentsContain(
  request: APIRequestContext,
  hrefs: Array<string>,
  marker: string,
) {
  for (const href of hrefs) {
    const response = await request.get(href)
    if (!response.ok()) continue

    const text = await response.text()
    if (text.includes(marker)) return true
  }

  return false
}

async function resourceContentsContain(
  page: Page,
  request: APIRequestContext,
  marker: string,
  filter: (url: string) => boolean,
) {
  const resourceUrls = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  )

  return modulePreloadContentsContain(
    request,
    resourceUrls.filter(filter),
    marker,
  )
}

async function documentModulePreloadHrefs(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="modulepreload"]'),
      (link) => link.href,
    ),
  )
}

function isHydrateBoundaryResource(url: string) {
  return (
    url.includes('/assets/components-') || url.includes('/static/js/async/')
  )
}

function isClientJavaScriptResource(url: string) {
  return (
    url.includes('/assets/') ||
    url.includes('/static/js/') ||
    url.includes('/static/js/async/')
  )
}

async function expectClientRouterReady(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (
            globalThis as typeof globalThis & {
              __TSR_ROUTER__?: unknown
            }
          ).__TSR_ROUTER__,
        ),
      ),
    )
    .toBe(true)
}

test.describe('Hydrate HMR', () => {
  test.skip(!isDev, 'HMR regression coverage runs against the dev server only')

  test.beforeAll(async () => {
    await componentsRouteEditor.capturePromise
  })

  test.afterEach(async () => {
    await componentsRouteEditor.capturePromise
    await componentsRouteEditor.restoreFiles()
  })

  test.afterAll(async () => {
    await componentsRouteEditor.capturePromise
    await componentsRouteEditor.restoreFiles()
  })

  test('updates deferred child chunks after the parent route is edited', async ({
    page,
  }) => {
    const pageErrors: Array<string> = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.goto('/components')
    await expectClientRouterReady(page)
    await expectRouteToStayUnhydrated(page, 'component-visible-button')

    await componentsRouteEditor.replaceText(
      'componentsRoute',
      interactiveBoxLabelSource,
      interactiveBoxHmrLabelSource,
    )

    await waitForComponentsServerHtmlText(page, 'hmr visible')
    if (isVite) {
      await waitForVisibleHydrateVirtualModule(page, 'hmr ')
    }

    await page.goto('/components')
    await expectClientRouterReady(page)
    await expectRouteToStayUnhydrated(page, 'component-visible-button')
    await scrollToBoundary(page, 'component-visible-button')
    await hmrExpect(page.getByTestId('component-visible-button')).toContainText(
      'hmr visible',
    )
    await clickAndExpectCount(
      page,
      'component-visible-button',
      'component-visible-count',
      '1',
    )
    expect(pageErrors).toEqual([])
  })
})

test.describe('component-level Hydrate runtime strategies', () => {
  test.skip(
    isDev,
    'production hydration coverage runs against the preview server',
  )

  test('renders SSR HTML and hydrates each runtime when appropriately', async ({
    page,
    request,
  }) => {
    await page.goto('/components')

    await expect(page.getByTestId('component-heading')).toHaveText(
      'Component Deferred Hydration',
    )

    await clickAndExpectCount(
      page,
      'component-load-button',
      'component-load-count',
      '1',
    )
    await clickAndExpectCount(
      page,
      'component-idle-button',
      'component-idle-count',
      '1',
    )
    await expect(
      resourceContentsContain(page, request, 'component-visible', (url) =>
        isHydrateBoundaryResource(url),
      ),
    ).resolves.toBe(false)
    await expectRouteToStayUnhydrated(page, 'component-visible-button')
    await scrollToBoundary(page, 'component-visible-button')
    await clickAndExpectCount(
      page,
      'component-visible-button',
      'component-visible-count',
      '1',
    )
    await expect
      .poll(() =>
        resourceContentsContain(page, request, 'component-visible', (url) =>
          isHydrateBoundaryResource(url),
        ),
      )
      .toBe(true)
    await clickAndExpectCount(
      page,
      'component-media-button',
      'component-media-count',
      '1',
    )
    await hoverIntentAndExpectCount(
      page,
      'component-interaction-button',
      'component-interaction-count',
      '1',
    )
    await expect(page.getByTestId('component-on-hydrated-count')).toHaveText(
      '0',
    )
    await expectRouteToStayUnhydrated(page, 'component-custom-single-button')
    await page.getByTestId('component-custom-single-button').hover()
    await expectRouteToStayUnhydrated(page, 'component-custom-single-button')
    await page.getByTestId('component-custom-single-button').click()
    await expectRouteToStayUnhydrated(page, 'component-custom-single-button')
    await dispatchHydrationIntent(
      page,
      'component-custom-single-button',
      'dblclick',
    )
    await expect(
      page.getByTestId('component-custom-single-button'),
    ).toHaveAttribute('data-hydrated', 'true')
    await expect(page.getByTestId('component-on-hydrated-count')).toHaveText(
      '1',
    )
    await clickAndExpectCount(
      page,
      'component-custom-single-button',
      'component-custom-single-count',
      '1',
    )
    await expect(page.getByTestId('component-on-hydrated-count')).toHaveText(
      '1',
    )
    await expectRouteToStayUnhydrated(page, 'component-custom-multi-button')
    await dispatchHydrationIntent(
      page,
      'component-custom-multi-button',
      'contextmenu',
    )
    await clickAndExpectCount(
      page,
      'component-custom-multi-button',
      'component-custom-multi-count',
      '1',
    )
    await expectRouteToStayUnhydrated(page, 'component-condition-button')
    await page.getByTestId('component-enable-condition').click()
    await clickAndExpectCount(
      page,
      'component-condition-button',
      'component-condition-count',
      '1',
    )
    await expectRouteToStayUnhydrated(page, 'component-click-replay-button')
    await page.getByTestId('component-click-replay-button').click()
    await expect(
      page.getByTestId('component-click-replay-button'),
    ).toHaveAttribute('data-hydrated', 'true')
    await expect(page.getByTestId('component-click-replay-count')).toHaveText(
      '1',
    )
    await expectRouteToStayUnhydrated(page, 'component-prefetch-button')
    await expect(
      resourceContentsContain(page, request, 'component-prefetch', (url) =>
        isHydrateBoundaryResource(url),
      ),
    ).resolves.toBe(false)
    await page.mouse.move(0, 0)
    await page.getByTestId('component-prefetch-button').hover()
    await expect(page.getByTestId('component-prefetch-button')).toHaveAttribute(
      'data-hydrated',
      'false',
    )
    await expect
      .poll(() =>
        resourceContentsContain(page, request, 'component-prefetch', (url) =>
          isHydrateBoundaryResource(url),
        ),
      )
      .toBe(true)
    await expect(page.getByTestId('component-prefetch-button')).toHaveAttribute(
      'data-hydrated',
      'false',
    )
    await page.getByTestId('component-prefetch-button').click()
    await expect(page.getByTestId('component-prefetch-button')).toHaveAttribute(
      'data-hydrated',
      'true',
    )
    await expect(page.getByTestId('component-prefetch-count')).toHaveText('1')
    await hoverIntentAndExpectCount(
      page,
      'component-nested-child-button',
      'component-nested-child-count',
      '1',
    )

    await page.getByTestId('component-never-button').click()
    await expect(page.getByTestId('component-never-count')).toHaveText('0')
  })

  test('replays click after another interaction boundary hydrates first', async ({
    page,
  }) => {
    await page.goto('/components')
    await expectClientRouterReady(page)

    await scrollToBoundary(page, 'component-custom-multi-button')
    await expectRouteToStayUnhydrated(page, 'component-custom-multi-button')
    await page.getByTestId('component-custom-multi-button').click({
      button: 'right',
    })
    await expect(
      page.getByTestId('component-custom-multi-button'),
    ).toHaveAttribute('data-hydrated', 'true')

    await scrollToBoundary(page, 'component-click-replay-button')
    await expectRouteToStayUnhydrated(page, 'component-click-replay-button')
    await page.getByTestId('component-click-replay-button').click()
    await expect(
      page.getByTestId('component-click-replay-button'),
    ).toHaveAttribute('data-hydrated', 'true')
    await expect(page.getByTestId('component-click-replay-count')).toHaveText(
      '1',
    )
  })

  test('shows fallback during a client-only mount while the child suspends', async ({
    page,
  }) => {
    await page.goto('/components')
    await expect(page.getByTestId('component-load-button')).toHaveAttribute(
      'data-hydrated',
      'true',
    )
    await page.getByTestId('component-show-client-fallback').click()

    await expect(page.getByTestId('component-client-fallback')).toHaveText(
      'client fallback',
    )
    await expect(page.getByTestId('component-fallback-child')).toHaveText(
      'fallback child',
    )
    await expect(page.getByTestId('component-client-fallback')).toHaveCount(0)
  })

  test('preserves scroll position after a force reload on a visible boundary', async ({
    page,
  }) => {
    await page.goto('/scroll-restoration')
    await expectClientRouterReady(page)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await expect(page.getByTestId('scroll-restoration-widget')).toHaveAttribute(
      'data-hydrated',
      'true',
    )
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })

    const beforeReloadDistanceFromBottom = await page.evaluate(
      () =>
        document.documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY,
    )
    expect(beforeReloadDistanceFromBottom).toBeLessThan(5)

    const client = await page.context().newCDPSession(page)
    const reloaded = page.waitForEvent('load')
    await client.send('Page.reload', { ignoreCache: true })
    await reloaded

    await expectClientRouterReady(page)
    await expect(page.getByTestId('scroll-restoration-widget')).toHaveAttribute(
      'data-hydrated',
      'true',
    )

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight -
            window.innerHeight -
            window.scrollY,
        ),
      )
      .toBeLessThan(20)
  })
})

test.describe('Hydrate CSS delivery', () => {
  test.skip(
    isDev,
    'production hydration coverage runs against the preview server',
  )

  test('ships CSS for deferred, never, shared, and nested boundaries without JavaScript', async ({
    browser,
    request,
  }) => {
    const response = await request.get('/css')
    const html = await response.text()

    htmlContainsText(html, 'CSS Deferred Hydration')
    htmlContainsText(html, 'Outer CSS')
    htmlContainsText(html, 'Deferred CSS')
    htmlContainsText(html, 'Never CSS')
    htmlContainsText(html, 'Nested CSS')

    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    try {
      await page.goto('/css')

      await expect(page.getByTestId('css-heading')).toHaveText(
        'CSS Deferred Hydration',
      )
      await expect(page.getByTestId('css-deferred')).toHaveText('Deferred CSS')
      await expect(page.getByTestId('css-never')).toHaveText('Never CSS')
      await expect(page.getByTestId('css-nested')).toHaveText('Nested CSS')

      await expectCssProperty(page, 'css-outer', 'color', 'rgb(12, 34, 56)')
      await expectCssProperty(
        page,
        'css-deferred',
        'background-color',
        'rgb(23, 45, 67)',
      )
      await expectCssProperty(page, 'css-never', 'color', 'rgb(45, 67, 89)')
      await expectCssProperty(
        page,
        'css-shared-outer',
        'border-top-color',
        'rgb(98, 76, 54)',
      )
      await expectCssProperty(
        page,
        'css-deferred',
        'border-top-color',
        'rgb(98, 76, 54)',
      )
      await expectCssProperty(
        page,
        'css-nested',
        'border-left-color',
        'rgb(67, 89, 123)',
      )
      await expectCssProperty(page, 'css-nested', 'border-left-width', '5px')
    } finally {
      await context.close()
    }
  })

  test('renders deferred content and omits never content after client-side navigation', async ({
    page,
  }) => {
    await page.goto('/')
    await expectClientRouterReady(page)
    await page.getByRole('link', { name: 'CSS', exact: true }).click()
    await expect(page).toHaveURL(/\/css$/)

    await expect(page.getByTestId('css-heading')).toHaveText(
      'CSS Deferred Hydration',
    )
    await expect(page.getByTestId('css-deferred')).toHaveText('Deferred CSS')
    await expect(page.getByTestId('css-never')).toHaveCount(0)
    await expect(page.getByTestId('css-nested')).toHaveCount(0)

    await expectCssProperty(
      page,
      'css-deferred',
      'background-color',
      'rgb(23, 45, 67)',
    )
  })
})

test.describe('imported Hydrate boundaries', () => {
  test.skip(
    isDev,
    'production hydration coverage runs against the preview server',
  )

  test('does not emit filtered shared Hydrate child JS on the initial document', async ({
    request,
  }) => {
    const response = await request.get('/imported')
    const html = await response.text()

    htmlContainsText(html, 'Imported Hydrate')
    htmlContainsText(html, 'Imported Hydrate Child')

    await expect(
      modulePreloadContentsContain(
        request,
        getModulePreloadHrefs(html),
        'imported-hydrate-child',
      ),
    ).resolves.toBe(false)
  })

  test('does not preload Hydrate child chunks before client navigation', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-heading')).toHaveText(
      'Deferred Hydration',
    )
    await expectClientRouterReady(page)

    const link = page.getByRole('link', { name: 'imported Hydrate' })
    await page.mouse.move(0, 0)
    await link.hover()
    await link.focus()

    await expect(
      modulePreloadContentsContain(
        request,
        await documentModulePreloadHrefs(page),
        'imported-hydrate-child',
      ),
    ).resolves.toBe(false)
    await expect(
      resourceContentsContain(page, request, 'imported-hydrate-child', (url) =>
        isClientJavaScriptResource(url),
      ),
    ).resolves.toBe(false)

    await page.getByRole('link', { name: 'imported Hydrate' }).click()
    await expect(page).toHaveURL(/\/imported$/)
    await expect(page.getByTestId('imported-hydrate-fallback')).toHaveCount(0)
    await expect(page.getByTestId('imported-hydrate-child')).toContainText(
      'Imported Hydrate Child',
    )
    await page.getByTestId('imported-hydrate-child').click()
    await expect(page.getByTestId('imported-hydrate-count')).toHaveText('1')
  })
})
