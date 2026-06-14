import type { AnyRouter } from '@tanstack/router-core'
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

export type PreloadComponentKind = 'item' | 'details' | 'report' | 'lazy'

export interface ItemSearch {
  view: string
}

export interface ReportSearch {
  tab: string
  page: number
}

export interface PreloadIndexSearch {
  intentItemId: string
  renderReportId: string
  viewportItemId: string
}

export interface PreloadingCounterSnapshot {
  itemBeforeLoads: Record<string, number>
  itemLoaders: Record<string, number>
  detailLoaders: Record<string, number>
  reportLoaders: Record<string, number>
  lazyLoaders: Record<string, number>
  componentPreloads: Record<PreloadComponentKind, number>
  lazyRouteResolutions: number
}

type PreloadingCounters = PreloadingCounterSnapshot

type PreloadingTarget = {
  manualItemId: string
  manualItemSearch: ItemSearch
  intentItemId: string
  intentItemSearch: ItemSearch
  renderReportId: string
  viewportItemId: string
  lazyId: string
  changedReportId: string
  changedReportSearch: ReportSearch
}

type ItemPreloadOptions = {
  to: '/preload/items/$itemId'
  params: { itemId: string }
  search: ItemSearch
}

type DetailPreloadOptions = {
  to: '/preload/items/$itemId/details'
  params: { itemId: string }
  search: ItemSearch
}

type ReportPreloadOptions = {
  to: '/preload/reports/$reportId'
  params: { reportId: string }
  search: ReportSearch
}

type LazyPreloadOptions = {
  to: '/preload/lazy/$lazyId'
  params: { lazyId: string }
}

type PreloadRouteOptions =
  | ItemPreloadOptions
  | DetailPreloadOptions
  | ReportPreloadOptions
  | LazyPreloadOptions

type PreloadingRouter = AnyRouter & {
  preloadRoute: (options: PreloadRouteOptions) => Promise<unknown>
}

export const BOOTSTRAP_RENDER_REPORT_ID = 'bootstrap-render-report'
export const BOOTSTRAP_INTENT_ITEM_ID = 'bootstrap-intent-item'
export const BOOTSTRAP_VIEWPORT_ITEM_ID = 'bootstrap-viewport-item'
export const DEFAULT_ITEM_SEARCH: ItemSearch = { view: 'summary' }
export const INTENT_ITEM_SEARCH: ItemSearch = { view: 'intent' }
export const VIEWPORT_ITEM_SEARCH: ItemSearch = { view: 'viewport' }
export const DEFAULT_REPORT_SEARCH: ReportSearch = { tab: 'summary', page: 1 }

const cycleCountPerInvocation = 2
const benchmarkRandom = createDeterministicRandom(0x7072656c)
let benchmarkSequence = 0

let counters = createEmptyCounters()

function createEmptyComponentCounters(): Record<PreloadComponentKind, number> {
  return {
    item: 0,
    details: 0,
    report: 0,
    lazy: 0,
  }
}

function createEmptyCounters(): PreloadingCounters {
  return {
    itemBeforeLoads: {},
    itemLoaders: {},
    detailLoaders: {},
    reportLoaders: {},
    lazyLoaders: {},
    componentPreloads: createEmptyComponentCounters(),
    lazyRouteResolutions: 0,
  }
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.trunc(numberValue)
    : fallback
}

function nextTargetId(label: string) {
  return `${label}-${benchmarkSequence.toString(36)}-${randomSegment(benchmarkRandom)}`
}

function createPreloadingTarget(): PreloadingTarget {
  const sequence = benchmarkSequence++

  return {
    manualItemId: nextTargetId('manual-item'),
    manualItemSearch: { view: `manual-${sequence % 4}` },
    intentItemId: nextTargetId('intent-item'),
    intentItemSearch: INTENT_ITEM_SEARCH,
    renderReportId: nextTargetId('render-report'),
    viewportItemId: nextTargetId('viewport-item'),
    lazyId: nextTargetId('lazy-route'),
    changedReportId: nextTargetId('changed-report'),
    changedReportSearch: {
      tab: `tab-${sequence % 5}`,
      page: (sequence % 7) + 2,
    },
  }
}

export function itemLoaderKey(itemId: string, search: ItemSearch) {
  return `${itemId}:${search.view}`
}

export function reportLoaderKey(reportId: string, search: ReportSearch) {
  return `${reportId}:${search.tab}:${search.page}`
}

export function normalizeItemSearch(
  search: Record<string, unknown>,
): ItemSearch {
  return {
    view: normalizeString(search.view, DEFAULT_ITEM_SEARCH.view),
  }
}

export function normalizeReportSearch(
  search: Record<string, unknown>,
): ReportSearch {
  return {
    tab: normalizeString(search.tab, DEFAULT_REPORT_SEARCH.tab),
    page: normalizePositiveInteger(search.page, DEFAULT_REPORT_SEARCH.page),
  }
}

export function normalizePreloadIndexSearch(
  search: Record<string, unknown>,
): PreloadIndexSearch {
  return {
    intentItemId: normalizeString(
      search.intentItemId,
      BOOTSTRAP_INTENT_ITEM_ID,
    ),
    renderReportId: normalizeString(
      search.renderReportId,
      BOOTSTRAP_RENDER_REPORT_ID,
    ),
    viewportItemId: normalizeString(
      search.viewportItemId,
      BOOTSTRAP_VIEWPORT_ITEM_ID,
    ),
  }
}

export function runPreloadingComputation(seed: string | number, rounds = 28) {
  const text = String(seed)
  let value = typeof seed === 'number' ? Math.trunc(seed) : text.length

  for (let index = 0; index < rounds; index++) {
    const charCode = text.charCodeAt(index % text.length) || 0
    value = (value * 1664525 + 1013904223 + charCode + index) >>> 0
  }

  return value
}

export function resetPreloadingCounters() {
  counters = createEmptyCounters()
}

export function getPreloadingCounters(): PreloadingCounterSnapshot {
  return {
    itemBeforeLoads: { ...counters.itemBeforeLoads },
    itemLoaders: { ...counters.itemLoaders },
    detailLoaders: { ...counters.detailLoaders },
    reportLoaders: { ...counters.reportLoaders },
    lazyLoaders: { ...counters.lazyLoaders },
    componentPreloads: { ...counters.componentPreloads },
    lazyRouteResolutions: counters.lazyRouteResolutions,
  }
}

export function recordItemBeforeLoad(itemId: string) {
  increment(counters.itemBeforeLoads, itemId)
  return runPreloadingComputation(itemId, 18)
}

export function recordItemLoader(itemId: string, search: ItemSearch) {
  const key = itemLoaderKey(itemId, search)
  increment(counters.itemLoaders, key)
  return runPreloadingComputation(key)
}

export function recordDetailLoader(itemId: string, search: ItemSearch) {
  const key = itemLoaderKey(itemId, search)
  increment(counters.detailLoaders, key)
  return runPreloadingComputation(`details:${key}`)
}

export function recordReportLoader(reportId: string, search: ReportSearch) {
  const key = reportLoaderKey(reportId, search)
  increment(counters.reportLoaders, key)
  return runPreloadingComputation(`report:${key}`, 34)
}

export function recordLazyLoader(lazyId: string) {
  increment(counters.lazyLoaders, lazyId)
  return runPreloadingComputation(`lazy:${lazyId}`, 32)
}

export function recordComponentPreload(kind: PreloadComponentKind) {
  counters.componentPreloads[kind] += 1
  return runPreloadingComputation(`component:${kind}`, 16)
}

export function recordLazyRouteResolution() {
  counters.lazyRouteResolutions += 1
  return runPreloadingComputation(
    `lazy-route:${counters.lazyRouteResolutions}`,
    18,
  )
}

export function createPreloadingWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  getCounters: () => PreloadingCounterSnapshot,
  resetCounters: () => void,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })

  function getRouter() {
    return lifecycle.getRouter() as unknown as PreloadingRouter
  }

  function getItemLoaderCount(itemId: string, search: ItemSearch) {
    return getCounters().itemLoaders[itemLoaderKey(itemId, search)] ?? 0
  }

  function getDetailLoaderCount(itemId: string, search: ItemSearch) {
    return getCounters().detailLoaders[itemLoaderKey(itemId, search)] ?? 0
  }

  function getReportLoaderCount(reportId: string, search: ReportSearch) {
    return getCounters().reportLoaders[reportLoaderKey(reportId, search)] ?? 0
  }

  function getLazyLoaderCount(lazyId: string) {
    return getCounters().lazyLoaders[lazyId] ?? 0
  }

  function assertPageMarker(expected: string) {
    const markers = Array.from(
      lifecycle
        .getContainer()
        .querySelectorAll<HTMLElement>('[data-preloading-page]'),
    )
    const marker = markers[markers.length - 1]
    const actual = marker?.dataset.preloadingPage

    if (actual !== expected) {
      throw new Error(`Expected preloading page ${expected}, got ${actual}`)
    }
  }

  async function preloadItem(
    itemId: string,
    search: ItemSearch,
    label = 'preload item',
  ) {
    await lifecycle.waitForPromise(
      getRouter().preloadRoute({
        to: '/preload/items/$itemId',
        params: { itemId },
        search,
      }),
      { label },
    )
  }

  async function preloadReport(
    reportId: string,
    search: ReportSearch,
    label = 'preload report',
  ) {
    await lifecycle.waitForPromise(
      getRouter().preloadRoute({
        to: '/preload/reports/$reportId',
        params: { reportId },
        search,
      }),
      { label },
    )
  }

  async function preloadLazy(lazyId: string, label = 'preload lazy route') {
    await lifecycle.waitForPromise(
      getRouter().preloadRoute({
        to: '/preload/lazy/$lazyId',
        params: { lazyId },
      }),
      { label },
    )
  }

  async function navigateToIndex(target: PreloadingTarget) {
    const expectedReportCount =
      getReportLoaderCount(target.renderReportId, DEFAULT_REPORT_SEARCH) + 1

    await lifecycle.navigate(
      {
        to: '/preload',
        search: {
          intentItemId: target.intentItemId,
          renderReportId: target.renderReportId,
          viewportItemId: target.viewportItemId,
        },
        replace: true,
      },
      { label: 'navigate to preload index' },
    )
    assertPageMarker('index')
    await lifecycle.waitForLink('intent-preload-item')
    await lifecycle.waitForCounter(
      () => getReportLoaderCount(target.renderReportId, DEFAULT_REPORT_SEARCH),
      expectedReportCount,
      { label: 'render-preload report loader' },
    )
  }

  async function dispatchIntentPreload(target: PreloadingTarget) {
    const expectedItemCount =
      getItemLoaderCount(target.intentItemId, target.intentItemSearch) + 1
    const link = await lifecycle.waitForLink('intent-preload-item')

    link.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        relatedTarget: null,
      }),
    )

    await lifecycle.waitForCounter(
      () => getItemLoaderCount(target.intentItemId, target.intentItemSearch),
      expectedItemCount,
      { label: 'intent-preload item loader' },
    )
  }

  async function navigateToItem(itemId: string, search: ItemSearch) {
    await lifecycle.navigate(
      {
        to: '/preload/items/$itemId',
        params: { itemId },
        search,
        replace: true,
      },
      { label: 'navigate to preloaded item' },
    )
    assertPageMarker('item')
  }

  async function navigateToDetails(itemId: string, search: ItemSearch) {
    await lifecycle.navigate(
      {
        to: '/preload/items/$itemId/details',
        params: { itemId },
        search,
        replace: true,
      },
      { label: 'navigate to preloaded details' },
    )
    assertPageMarker('details')
  }

  async function runCycle(target: PreloadingTarget) {
    await preloadItem(
      target.manualItemId,
      target.manualItemSearch,
      'manual item A',
    )
    await navigateToIndex(target)
    await preloadItem(
      target.viewportItemId,
      VIEWPORT_ITEM_SEARCH,
      'direct viewport item preload',
    )
    await dispatchIntentPreload(target)
    await preloadItem(
      target.manualItemId,
      target.manualItemSearch,
      'deduped item A',
    )

    const expectedLazyCount = getLazyLoaderCount(target.lazyId) + 1
    await preloadLazy(target.lazyId, 'warm lazy route')
    await lifecycle.waitForCounter(
      () => getLazyLoaderCount(target.lazyId),
      expectedLazyCount,
      { label: 'lazy route loader' },
    )
    await preloadLazy(target.lazyId, 'deduped lazy route')

    await navigateToItem(target.manualItemId, target.manualItemSearch)
    await navigateToDetails(target.intentItemId, target.intentItemSearch)
    await preloadReport(
      target.changedReportId,
      target.changedReportSearch,
      'changed report search deps',
    )
  }

  async function before() {
    resetCounters()
    await lifecycle.before()
    await lifecycle.waitForLink('intent-preload-item')
    await lifecycle.waitForCounter(
      () =>
        getReportLoaderCount(BOOTSTRAP_RENDER_REPORT_ID, DEFAULT_REPORT_SEARCH),
      1,
      { label: 'bootstrap render preload' },
    )
    await lifecycle.navigate(
      {
        to: '/preload/park',
        replace: true,
      },
      { label: 'park after bootstrap render preload' },
    )
    assertPageMarker('park')
    resetCounters()
  }

  async function after() {
    await lifecycle.after()
  }

  async function run() {
    for (let index = 0; index < cycleCountPerInvocation; index++) {
      await runCycle(createPreloadingTarget())
    }
  }

  async function sanity() {
    await before()

    try {
      const itemId = 'sanity-item'
      const firstLoadCount = getItemLoaderCount(itemId, DEFAULT_ITEM_SEARCH)
      await preloadItem(itemId, DEFAULT_ITEM_SEARCH, 'sanity initial preload')

      const afterPreloadCount = getItemLoaderCount(itemId, DEFAULT_ITEM_SEARCH)
      if (afterPreloadCount !== firstLoadCount + 1) {
        throw new Error(
          `Expected sanity preload to run item loader once, got ${afterPreloadCount - firstLoadCount}`,
        )
      }

      await preloadItem(itemId, DEFAULT_ITEM_SEARCH, 'sanity dedupe preload')
      const afterDedupeCount = getItemLoaderCount(itemId, DEFAULT_ITEM_SEARCH)
      if (afterDedupeCount !== afterPreloadCount) {
        throw new Error('Expected repeated preload to dedupe item loader')
      }

      await navigateToItem(itemId, DEFAULT_ITEM_SEARCH)
      const afterNavigationCount = getItemLoaderCount(
        itemId,
        DEFAULT_ITEM_SEARCH,
      )
      if (afterNavigationCount !== afterPreloadCount) {
        throw new Error('Expected preloaded item data to promote on navigation')
      }

      const detailId = 'sanity-detail-item'
      await getRouter().preloadRoute({
        to: '/preload/items/$itemId/details',
        params: { itemId: detailId },
        search: INTENT_ITEM_SEARCH,
      })
      if (getDetailLoaderCount(detailId, INTENT_ITEM_SEARCH) !== 1) {
        throw new Error('Expected detail preload to run detail loader once')
      }

      const lazyId = 'sanity-lazy'
      const lazyRouteResolutionsBefore = getCounters().lazyRouteResolutions
      await preloadLazy(lazyId, 'sanity lazy preload')
      await preloadLazy(lazyId, 'sanity lazy dedupe')
      const lazyRouteResolutionsAfter = getCounters().lazyRouteResolutions
      if (lazyRouteResolutionsAfter !== lazyRouteResolutionsBefore + 1) {
        throw new Error(
          'Expected lazy route option merge to dedupe after warmup',
        )
      }
    } finally {
      await after()
    }
  }

  return {
    name: `client preloading loop (${framework})`,
    before,
    run,
    sanity,
    after,
  }
}
