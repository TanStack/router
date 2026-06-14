import type { NavigateOptions } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
  type Framework,
  type MountTestApp,
} from '#client-nav/lifecycle'

export type HeadSearch = {
  variant: string
  seed: number
  panel: string
}

export type HeadLoaderData = {
  kind: string
  resourceId: string
  seed: number
  label: string
  checksum: number
}

type HeadExpectation = {
  route: string
  title: string
  description: string
  sharedContent: string
  canonical: string
  productId?: string
}

type HeadSnapshot = {
  html: string
  title: string
}

type NavigationStep = {
  label: string
  options: Record<string, unknown>
}

type ScrollGlobal = typeof globalThis & {
  scrollTo?: typeof window.scrollTo
}

type HeadLinkEntry = Record<string, string>
type HeadScriptEntry = Record<string, string>

const scenarioRandom = createDeterministicRandom(0x14ead123)

export const headScenarioSlug = 'head-management'
export const sharedMetaName = 'head-benchmark-shared'
export const descriptionMetaName = 'description'
export const productMetaCount = 18
export const productScriptCount = 5
export const navigationStepsPerCycle = 6
export const navigationCyclesPerRun = 3
export const navigationsPerBenchRun =
  navigationStepsPerCycle * navigationCyclesPerRun

export const settingsTabs = ['profile', 'billing', 'security', 'members']
export const initialHeadSearch = createHeadSearch(0, 'initial')
export const initialLocation = createHeadHref('/head', initialHeadSearch)

function createSegments(prefix: string, count: number) {
  const values: Array<string> = []

  for (let index = 0; index < count; index++) {
    values.push(`${prefix}-${index}-${randomSegment(scenarioRandom)}`)
  }

  return values
}

export const articleIds = createSegments('article', 96)
export const productIds = createSegments('product', 72)

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value)

  if (Number.isFinite(numberValue) && numberValue > 0) {
    return Math.trunc(numberValue)
  }

  return fallback
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

export function normalizeHeadSearch(
  search: Record<string, unknown>,
): HeadSearch {
  return {
    variant: normalizeString(search.variant, 'default'),
    seed: normalizePositiveInteger(search.seed, 1),
    panel: normalizeString(search.panel, 'main'),
  }
}

export function runHeadComputation(value: string, seed: number) {
  let hash = seed >>> 0

  for (let round = 0; round < 24; round++) {
    for (let index = 0; index < value.length; index++) {
      hash = (hash ^ value.charCodeAt(index) ^ ((round + 1) * 2654435761)) >>> 0
      hash = (hash * 1664525 + 1013904223 + index) >>> 0
    }
  }

  return hash
}

export function createHeadSearch(cycle: number, label: string): HeadSearch {
  const checksum = runHeadComputation(`${label}:${cycle}`, cycle + 29)

  return {
    variant: `${label}-${cycle % 7}`,
    seed: (checksum % 50_000) + 1,
    panel: `panel-${checksum % 11}`,
  }
}

export function stringifyHeadSearch(search: HeadSearch) {
  const params = new URLSearchParams()
  params.set('variant', search.variant)
  params.set('seed', `${search.seed}`)
  params.set('panel', search.panel)

  return `?${params.toString()}`
}

export function createHeadHref(pathname: string, search: HeadSearch) {
  return `${pathname}${stringifyHeadSearch(search)}`
}

export function createHeadLoaderData(
  kind: string,
  resourceId: string,
  search: HeadSearch,
): HeadLoaderData {
  const label = `${kind}-${search.variant}-${search.panel}`
  const checksum = runHeadComputation(
    `${label}:${resourceId}:${search.seed}`,
    search.seed,
  )

  return {
    kind,
    resourceId,
    seed: search.seed,
    label,
    checksum,
  }
}

function createDescription(route: string, loaderData: HeadLoaderData) {
  return `${route} head ${loaderData.resourceId} ${loaderData.checksum}`
}

function createSharedMetaContent(route: string, loaderData: HeadLoaderData) {
  return `${route}-${loaderData.checksum}-${loaderData.seed}`
}

function createSectionTitle(loaderData: HeadLoaderData) {
  return `Client Head Section ${loaderData.checksum}`
}

function createArticleListTitle(loaderData: HeadLoaderData) {
  return `Client Head Articles ${loaderData.checksum}`
}

function createArticleTitle(articleId: string, loaderData: HeadLoaderData) {
  return `Client Head Article ${articleId} ${loaderData.checksum}`
}

function createProductTitle(productId: string, loaderData: HeadLoaderData) {
  return `Client Head Product ${productId} ${loaderData.checksum}`
}

function createSettingsTitle(
  tab: string | undefined,
  loaderData: HeadLoaderData,
) {
  return `Client Head Settings ${tab ?? 'general'} ${loaderData.checksum}`
}

function createScenarioMeta(
  route: string,
  loaderData: HeadLoaderData,
  title: string,
) {
  return [
    { title },
    {
      name: descriptionMetaName,
      content: createDescription(route, loaderData),
      'data-head-scenario': headScenarioSlug,
      'data-head-route': route,
    },
    {
      name: sharedMetaName,
      content: createSharedMetaContent(route, loaderData),
      'data-head-scenario': headScenarioSlug,
      'data-head-route': route,
    },
  ]
}

function createSharedPreloadLink() {
  return {
    rel: 'preload',
    as: 'fetch',
    href: '/head-assets/shared-head-payload.json',
    'data-head-shared-link': 'true',
  }
}

function createRouteLinks(
  route: string,
  canonical: string,
  loaderData: HeadLoaderData,
  preloadCount: number,
) {
  const links: Array<HeadLinkEntry> = [
    {
      rel: 'canonical',
      href: canonical,
      'data-head-scenario': headScenarioSlug,
      'data-head-canonical': route,
    },
    createSharedPreloadLink(),
  ]

  for (let index = 0; index < preloadCount; index++) {
    links.push({
      rel: 'preload',
      as: index % 2 === 0 ? 'fetch' : 'image',
      href: `/head-assets/${route}-${loaderData.checksum}-${index}.json`,
      'data-head-scenario': headScenarioSlug,
      'data-head-route-link': route,
      'data-head-link-index': `${index}`,
    })
  }

  return links
}

function createSharedScript() {
  return {
    type: 'application/json',
    'data-head-shared-script': 'true',
    children: '{"scenario":"head-management","shared":true}',
  }
}

function createProductScripts(productId: string, loaderData: HeadLoaderData) {
  const scripts: Array<HeadScriptEntry> = [createSharedScript()]

  for (let index = 0; index < productScriptCount; index++) {
    scripts.push({
      type: 'application/json',
      'data-head-product-script': 'true',
      'data-head-product-id': productId,
      'data-head-script-index': `${index}`,
      children: JSON.stringify({
        scenario: headScenarioSlug,
        productId,
        index,
        checksum: runHeadComputation(
          `${productId}:script:${index}`,
          loaderData.checksum + index,
        ),
      }),
    })
  }

  return scripts
}

function createProductMeta(productId: string, loaderData: HeadLoaderData) {
  const meta: Array<Record<string, string>> = []

  for (let index = 0; index < productMetaCount; index++) {
    const checksum = runHeadComputation(
      `${productId}:meta:${index}`,
      loaderData.seed + index,
    )
    meta.push({
      name: `product:attribute:${index}`,
      content: `${productId}-${checksum}`,
      'data-head-scenario': headScenarioSlug,
      'data-head-product-meta': 'true',
      'data-head-product-id': productId,
      'data-head-product-index': `${index}`,
    })
  }

  return meta
}

export function createHeadSectionHead(loaderData: HeadLoaderData) {
  return {
    meta: [
      ...createScenarioMeta(
        'section',
        loaderData,
        createSectionTitle(loaderData),
      ),
      {
        property: 'og:site_name',
        content: 'TanStack Router Client Head Benchmark',
        'data-head-scenario': headScenarioSlug,
      },
      {
        name: 'theme-color',
        content: `#${(loaderData.checksum % 0xffffff).toString(16).padStart(6, '0')}`,
        'data-head-scenario': headScenarioSlug,
      },
    ],
    links: createRouteLinks('section', '/head', loaderData, 3),
    scripts: [createSharedScript()],
  }
}

export function createArticlesHead(loaderData: HeadLoaderData) {
  return {
    meta: [
      ...createScenarioMeta(
        'articles',
        loaderData,
        createArticleListTitle(loaderData),
      ),
      {
        property: 'og:title',
        content: `Articles ${loaderData.checksum}`,
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'articles',
      },
      {
        property: 'og:type',
        content: 'website',
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'articles',
      },
      {
        name: 'article:list-count',
        content: `${articleIds.length}`,
        'data-head-scenario': headScenarioSlug,
      },
    ],
    links: createRouteLinks('articles', '/head/articles', loaderData, 8),
    scripts: [createSharedScript()],
  }
}

export function createArticleHead(
  articleId: string,
  loaderData: HeadLoaderData,
) {
  return {
    meta: [
      ...createScenarioMeta(
        'article',
        loaderData,
        createArticleTitle(articleId, loaderData),
      ),
      {
        property: 'og:title',
        content: `Article ${articleId} ${loaderData.checksum}`,
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'article',
      },
      {
        property: 'og:type',
        content: 'article',
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'article',
      },
      {
        property: 'article:published_time',
        content: `2024-01-${String((loaderData.checksum % 28) + 1).padStart(2, '0')}`,
        'data-head-scenario': headScenarioSlug,
      },
      {
        name: 'article:id',
        content: articleId,
        'data-head-scenario': headScenarioSlug,
      },
      {
        'script:ld+json': {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: articleId,
          identifier: `${articleId}-${loaderData.checksum}`,
        },
      },
    ],
    links: createRouteLinks(
      'article',
      `/head/articles/${articleId}`,
      loaderData,
      5,
    ),
    scripts: [createSharedScript()],
  }
}

export function createProductHead(
  productId: string,
  loaderData: HeadLoaderData,
) {
  return {
    meta: [
      ...createScenarioMeta(
        'product',
        loaderData,
        createProductTitle(productId, loaderData),
      ),
      {
        property: 'og:type',
        content: 'product',
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'product',
      },
      {
        property: 'product:retailer_item_id',
        content: productId,
        'data-head-scenario': headScenarioSlug,
      },
      ...createProductMeta(productId, loaderData),
    ],
    links: createRouteLinks(
      'product',
      `/head/products/${productId}`,
      loaderData,
      7,
    ),
    scripts: createProductScripts(productId, loaderData),
  }
}

export function createSettingsHead(
  tab: string | undefined,
  loaderData: HeadLoaderData,
) {
  const normalizedTab = tab ?? 'general'

  return {
    meta: [
      ...createScenarioMeta(
        'settings',
        loaderData,
        createSettingsTitle(tab, loaderData),
      ),
      {
        name: 'settings:tab',
        content: normalizedTab,
        'data-head-scenario': headScenarioSlug,
      },
      {
        property: 'og:title',
        content: `Settings ${normalizedTab}`,
        'data-head-scenario': headScenarioSlug,
        'data-head-route': 'settings',
      },
    ],
    links: createRouteLinks(
      'settings',
      tab ? `/head/settings/${tab}` : '/head/settings',
      loaderData,
      4,
    ),
    scripts: [createSharedScript()],
  }
}

function createSectionExpectation(search: HeadSearch): HeadExpectation {
  const loaderData = createHeadLoaderData('section', 'root', search)

  return {
    route: 'section',
    title: createSectionTitle(loaderData),
    description: createDescription('section', loaderData),
    sharedContent: createSharedMetaContent('section', loaderData),
    canonical: '/head',
  }
}

function createArticleExpectation(
  articleId: string,
  search: HeadSearch,
): HeadExpectation {
  const loaderData = createHeadLoaderData('article', articleId, search)

  return {
    route: 'article',
    title: createArticleTitle(articleId, loaderData),
    description: createDescription('article', loaderData),
    sharedContent: createSharedMetaContent('article', loaderData),
    canonical: `/head/articles/${articleId}`,
  }
}

function createProductExpectation(
  productId: string,
  search: HeadSearch,
): HeadExpectation {
  const loaderData = createHeadLoaderData('product', productId, search)

  return {
    route: 'product',
    title: createProductTitle(productId, loaderData),
    description: createDescription('product', loaderData),
    sharedContent: createSharedMetaContent('product', loaderData),
    canonical: `/head/products/${productId}`,
    productId,
  }
}

function createSettingsExpectation(
  tab: string | undefined,
  search: HeadSearch,
): HeadExpectation {
  const resourceId = tab ?? 'general'
  const loaderData = createHeadLoaderData('settings', resourceId, search)

  return {
    route: 'settings',
    title: createSettingsTitle(tab, loaderData),
    description: createDescription('settings', loaderData),
    sharedContent: createSharedMetaContent('settings', loaderData),
    canonical: tab ? `/head/settings/${tab}` : '/head/settings',
  }
}

function createNavigationCycle(cycle: number): Array<NavigationStep> {
  const firstArticleId = articleIds[(cycle * 5 + 1) % articleIds.length]!
  const secondArticleId = articleIds[(cycle * 5 + 2) % articleIds.length]!
  const productId = productIds[(cycle * 7 + 3) % productIds.length]!
  const tab = settingsTabs[cycle % settingsTabs.length]!

  return [
    {
      label: `articles-list-${cycle}`,
      options: {
        to: '/head/articles',
        search: createHeadSearch(cycle, 'articles-list'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `article-a-${cycle}`,
      options: {
        to: '/head/articles/$articleId',
        params: { articleId: firstArticleId },
        search: createHeadSearch(cycle, 'article-a'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `article-b-${cycle}`,
      options: {
        to: '/head/articles/$articleId',
        params: { articleId: secondArticleId },
        search: createHeadSearch(cycle, 'article-b'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `product-${cycle}`,
      options: {
        to: '/head/products/$productId',
        params: { productId },
        search: createHeadSearch(cycle, 'product'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `settings-tab-${cycle}`,
      options: {
        to: '/head/settings/{-$tab}',
        params: { tab },
        search: createHeadSearch(cycle, 'settings-tab'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `settings-empty-${cycle}`,
      options: {
        to: '/head/settings/{-$tab}',
        params: { tab: undefined },
        search: createHeadSearch(cycle, 'settings-empty'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
  ]
}

const navigationSteps = Array.from(
  { length: navigationCyclesPerRun },
  (_, cycle) => createNavigationCycle(cycle),
).flat()

function captureDocumentHead(): HeadSnapshot {
  return {
    html: document.head.innerHTML,
    title: document.title,
  }
}

function restoreDocumentHead(snapshot: HeadSnapshot) {
  document.head.innerHTML = snapshot.html

  if (document.title !== snapshot.title) {
    document.title = snapshot.title
  }
}

function patchMissingScrollToGlobal() {
  const scrollGlobal = globalThis as ScrollGlobal
  const hadScrollTo = Object.prototype.hasOwnProperty.call(
    scrollGlobal,
    'scrollTo',
  )
  const previousScrollTo = scrollGlobal.scrollTo

  if (typeof previousScrollTo === 'function') {
    return () => {}
  }

  const fallbackScrollTo =
    typeof window !== 'undefined' && typeof window.scrollTo === 'function'
      ? window.scrollTo.bind(window)
      : () => {}

  Object.defineProperty(scrollGlobal, 'scrollTo', {
    value: fallbackScrollTo,
    configurable: true,
    writable: true,
  })

  let restored = false

  return () => {
    if (restored) {
      return
    }

    restored = true

    if (hadScrollTo) {
      Object.defineProperty(scrollGlobal, 'scrollTo', {
        value: previousScrollTo,
        configurable: true,
        writable: true,
      })
      return
    }

    delete (scrollGlobal as { scrollTo?: typeof window.scrollTo }).scrollTo
  }
}

function findRouteMarker(container: ParentNode, route: string) {
  return container.querySelector<HTMLElement>(`[data-route-marker="${route}"]`)
}

function routeMarkerMatches(
  container: ParentNode,
  route: string,
  expectedDataset: Record<string, string> = {},
) {
  const marker = findRouteMarker(container, route)

  if (!marker) {
    return false
  }

  for (const [key, value] of Object.entries(expectedDataset)) {
    if (marker.dataset[key] !== value) {
      return false
    }
  }

  return true
}

function assertRouteMarker(
  container: ParentNode,
  route: string,
  expectedDataset: Record<string, string> = {},
) {
  const marker = findRouteMarker(container, route)

  if (!marker) {
    throw new Error(`Expected head-management route marker ${route}`)
  }

  for (const [key, value] of Object.entries(expectedDataset)) {
    if (marker.dataset[key] !== value) {
      throw new Error(
        `Expected head-management marker ${route} ${key}=${value}, got ${marker.dataset[key]}`,
      )
    }
  }
}

function readScenarioMeta(name: string) {
  return document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"][data-head-scenario="${headScenarioSlug}"]`,
  )
}

function countScenarioMeta(name: string) {
  return document.head.querySelectorAll(
    `meta[name="${name}"][data-head-scenario="${headScenarioSlug}"]`,
  ).length
}

function headMatchesExpectation(expectation: HeadExpectation) {
  if (document.title !== expectation.title) {
    return false
  }

  const description = readScenarioMeta(descriptionMetaName)
  if (description?.getAttribute('content') !== expectation.description) {
    return false
  }

  const shared = readScenarioMeta(sharedMetaName)
  if (shared?.getAttribute('content') !== expectation.sharedContent) {
    return false
  }

  const canonical = document.head.querySelector<HTMLLinkElement>(
    `link[rel="canonical"][data-head-canonical="${expectation.route}"]`,
  )
  if (canonical?.getAttribute('href') !== expectation.canonical) {
    return false
  }

  if (
    document.head.querySelectorAll('link[data-head-shared-link="true"]')
      .length !== 1
  ) {
    return false
  }

  if (expectation.productId) {
    const productMeta = document.head.querySelectorAll(
      `meta[data-head-product-meta="true"][data-head-product-id="${expectation.productId}"]`,
    )

    if (productMeta.length !== productMetaCount) {
      return false
    }
  }

  return true
}

function assertHeadExpectation(expectation: HeadExpectation) {
  if (document.title !== expectation.title) {
    throw new Error(
      `Expected document title ${expectation.title}, got ${document.title}`,
    )
  }

  if (countScenarioMeta(descriptionMetaName) !== 1) {
    throw new Error('Expected exactly one scenario description meta tag')
  }

  if (countScenarioMeta(sharedMetaName) !== 1) {
    throw new Error('Expected exactly one deduped shared scenario meta tag')
  }

  const description = readScenarioMeta(descriptionMetaName)
  if (description?.getAttribute('content') !== expectation.description) {
    throw new Error(
      `Expected description ${expectation.description}, got ${description?.getAttribute('content')}`,
    )
  }

  const shared = readScenarioMeta(sharedMetaName)
  if (shared?.getAttribute('content') !== expectation.sharedContent) {
    throw new Error(
      `Expected shared meta ${expectation.sharedContent}, got ${shared?.getAttribute('content')}`,
    )
  }

  const canonical = document.head.querySelector<HTMLLinkElement>(
    `link[rel="canonical"][data-head-canonical="${expectation.route}"]`,
  )
  if (canonical?.getAttribute('href') !== expectation.canonical) {
    throw new Error(
      `Expected canonical ${expectation.canonical}, got ${canonical?.getAttribute('href')}`,
    )
  }

  const sharedLinks = document.head.querySelectorAll(
    'link[data-head-shared-link="true"]',
  )
  if (sharedLinks.length !== 1) {
    throw new Error(
      `Expected one deduped shared link, got ${sharedLinks.length}`,
    )
  }

  if (expectation.productId) {
    const productMeta = document.head.querySelectorAll(
      `meta[data-head-product-meta="true"][data-head-product-id="${expectation.productId}"]`,
    )

    if (productMeta.length !== productMetaCount) {
      throw new Error(
        `Expected ${productMetaCount} product meta tags, got ${productMeta.length}`,
      )
    }
  }
}

export function createHeadManagementWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({
    mountTestApp,
    timeoutMs: 4_000,
  })
  let stepIndex = 0
  let headSnapshot: HeadSnapshot | undefined = undefined
  let restoreScrollTo: (() => void) | undefined = undefined

  async function after() {
    const snapshot = headSnapshot
    const restoreScroll = restoreScrollTo
    headSnapshot = undefined
    restoreScrollTo = undefined
    let teardownError: unknown = undefined

    try {
      await lifecycle.after()
    } catch (error) {
      teardownError = error
    } finally {
      if (snapshot) {
        restoreDocumentHead(snapshot)
      }

      if (restoreScroll) {
        restoreScroll()
      }
    }

    if (teardownError) {
      throw teardownError
    }
  }

  async function waitForRouteMarker(
    route: string,
    expectedDataset: Record<string, string> = {},
  ) {
    await lifecycle.waitForCounter(
      () =>
        routeMarkerMatches(lifecycle.getContainer(), route, expectedDataset)
          ? 1
          : 0,
      1,
      { label: `head-management route marker ${route}` },
    )
    assertRouteMarker(lifecycle.getContainer(), route, expectedDataset)
  }

  async function waitForHeadExpectation(expectation: HeadExpectation) {
    await lifecycle.waitForCounter(
      () => (headMatchesExpectation(expectation) ? 1 : 0),
      1,
      { label: `head-management head ${expectation.route}` },
    )
    assertHeadExpectation(expectation)
  }

  async function before() {
    await after()
    stepIndex = 0
    headSnapshot = captureDocumentHead()
    restoreScrollTo = patchMissingScrollToGlobal()

    try {
      await lifecycle.before()
      await waitForRouteMarker('head')
      await waitForHeadExpectation(createSectionExpectation(initialHeadSearch))
    } catch (error) {
      await after()
      throw error
    }
  }

  async function runSteps(count: number) {
    for (let index = 0; index < count; index++) {
      const step = navigationSteps[stepIndex % navigationSteps.length]!
      stepIndex += 1

      await lifecycle.navigate(step.options as NavigateOptions, {
        wait: 'rendered',
        label: step.label,
      })
    }
  }

  async function sanity() {
    await before()

    try {
      const articleId = articleIds[5]!
      const articleSearch = createHeadSearch(23, 'sanity-article')
      const productId = productIds[9]!
      const productSearch = createHeadSearch(23, 'sanity-product')
      const settingsSearch = createHeadSearch(23, 'sanity-settings-empty')

      await lifecycle.navigate(
        {
          to: '/head/articles/$articleId',
          params: { articleId },
          search: articleSearch,
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        } as NavigateOptions,
        { wait: 'rendered', label: 'sanity article detail' },
      )
      await waitForRouteMarker('article', { articleId })
      await waitForHeadExpectation(
        createArticleExpectation(articleId, articleSearch),
      )
      const articleTitle = document.title

      await lifecycle.navigate(
        {
          to: '/head/products/$productId',
          params: { productId },
          search: productSearch,
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        } as NavigateOptions,
        { wait: 'rendered', label: 'sanity product detail' },
      )
      await waitForRouteMarker('product', { productId })
      await waitForHeadExpectation(
        createProductExpectation(productId, productSearch),
      )

      if (document.title === articleTitle) {
        throw new Error('Expected dynamic product navigation to change title')
      }

      await lifecycle.navigate(
        {
          to: '/head/settings/{-$tab}',
          params: { tab: undefined },
          search: settingsSearch,
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        } as NavigateOptions,
        { wait: 'rendered', label: 'sanity settings optional empty' },
      )
      await waitForRouteMarker('settings', { tab: 'none' })
      await waitForHeadExpectation(
        createSettingsExpectation(undefined, settingsSearch),
      )

      await runSteps(navigationStepsPerCycle)
    } finally {
      await after()
    }
  }

  return {
    name: `client head management loop (${framework})`,
    before,
    run: () => runSteps(navigationsPerBenchRun),
    sanity,
    after,
  }
}
