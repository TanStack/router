import type { AnyRouter } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import { createDeterministicRandom } from '#client-nav/bench-utils'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
  type Framework,
  type MountTestApp,
} from '#client-nav/lifecycle'

export interface TransientSearch {
  debug?: boolean
  junk?: string
}

export interface ShopFlags {
  preview: boolean
  cohorts: Array<string>
  weights: Record<string, number>
}

export interface ShopSearch {
  tenant: string
  locale: string
  flags: ShopFlags
}

export type ShopSearchSchema = ShopSearch & TransientSearch

export interface ProductFilters {
  categories: Array<string>
  tags: Array<string>
  price: {
    min: number
    max: number
  }
  inventory: {
    inStock: boolean
    warehouses: Array<string>
  }
  attributes: Record<string, string | number | boolean>
}

export interface ProductSearchValues extends TransientSearch {
  page: number
  pageSize: number
  sort: string
  view: string
  includeFacets: boolean
  filters: ProductFilters
}

export type ProductsSearch = ShopSearchSchema & ProductSearchValues

export interface DetailSearchValues extends TransientSearch {
  detailTab: string
  panel: string
  showInventory: boolean
}

export type DetailSearch = ProductsSearch & DetailSearchValues

export interface CompareSlot {
  id: string
  priority: number
  pinned: boolean
}

export interface CompareSearchValues extends TransientSearch {
  compareIds: Array<string>
  slots: Record<string, CompareSlot>
  matrix: Record<string, Array<number>>
  includeRelated: boolean
  revision: number
}

export type CompareSearch = ShopSearchSchema & CompareSearchValues

export interface SearchNavigationSet {
  full: ProductsSearch
  nested: ProductsSearch
  paged: ProductsSearch
  detail: DetailSearchValues
  compare: CompareSearch
  updater: ProductsSearch
  productId: string
}

const tenantIds = ['tenant-a', 'tenant-b', 'tenant-c', 'tenant-d'] as const
const locales = ['en-US', 'de-DE', 'fr-FR', 'ja-JP'] as const
const cohorts = ['alpha', 'beta', 'stable', 'holiday', 'vip'] as const
const categories = ['shoes', 'bags', 'jackets', 'accessories', 'sale'] as const
const tags = ['eco', 'new', 'featured', 'limited', 'bundle', 'gift'] as const
const sorts = ['relevance', 'price-asc', 'price-desc', 'rating'] as const
const views = ['grid', 'list'] as const
const productColors = ['black', 'brown', 'blue', 'white'] as const
const detailTabs = ['summary', 'reviews', 'shipping', 'bundles'] as const
const detailPanels = ['overview', 'specs', 'offers'] as const
const warehouses = ['iad', 'fra', 'hnd', 'syd', 'gru'] as const

export const DEFAULT_FLAGS: ShopFlags = {
  preview: false,
  cohorts: ['stable'],
  weights: {
    stable: 1,
  },
}

export const defaultProductFilters: ProductFilters = {
  categories: ['shoes'],
  tags: ['featured'],
  price: {
    min: 0,
    max: 250,
  },
  inventory: {
    inStock: true,
    warehouses: ['iad'],
  },
  attributes: {
    color: 'black',
    rating: 4,
    sustainable: true,
  },
}

export const shopSubscriberIds = Array.from({ length: 8 }, (_, index) => index)
export const routeSubscriberIds = Array.from({ length: 6 }, (_, index) => index)

const NAVIGATIONS_PER_RUN = 24
const ACTION_SEQUENCE_LENGTH = 6
const NAVIGATION_SET_COUNT = 48

function pick<T>(values: ReadonlyArray<T>, index: number) {
  return values[index % values.length]!
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }

  return fallback
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value)

  if (Number.isFinite(numberValue) && numberValue > 0) {
    return Math.trunc(numberValue)
  }

  return fallback
}

function normalizeStringArray(value: unknown, fallback: Array<string>) {
  if (Array.isArray(value)) {
    const normalized = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )

    if (normalized.length > 0) {
      return normalized
    }
  }

  return fallback.slice()
}

function normalizeNumberArray(value: unknown, fallback: Array<number>) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))

    if (normalized.length > 0) {
      return normalized
    }
  }

  return fallback.slice()
}

function normalizeNumberRecord(
  value: unknown,
  fallback: Record<string, number>,
) {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  const normalized: Record<string, number> = {}

  for (const [key, item] of Object.entries(value)) {
    const numberValue = Number(item)

    if (Number.isFinite(numberValue)) {
      normalized[key] = numberValue
    }
  }

  if (Object.keys(normalized).length > 0) {
    return normalized
  }

  return { ...fallback }
}

function normalizeStringNumberBooleanRecord(
  value: unknown,
  fallback: Record<string, string | number | boolean>,
) {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  const normalized: Record<string, string | number | boolean> = {}

  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      normalized[key] = item
    }
  }

  if (Object.keys(normalized).length > 0) {
    return normalized
  }

  return { ...fallback }
}

export function validateShopSearch(
  search: Record<string, unknown>,
): ShopSearchSchema {
  const flags = isRecord(search.flags) ? search.flags : {}

  return {
    tenant: normalizeString(search.tenant, 'tenant-a'),
    locale: normalizeString(search.locale, 'en-US'),
    flags: {
      preview: normalizeBoolean(flags.preview, DEFAULT_FLAGS.preview),
      cohorts: normalizeStringArray(flags.cohorts, DEFAULT_FLAGS.cohorts),
      weights: normalizeNumberRecord(flags.weights, DEFAULT_FLAGS.weights),
    },
  }
}

export function validateProductsSearch(
  search: Record<string, unknown>,
): ProductSearchValues {
  const filters = isRecord(search.filters) ? search.filters : {}
  const price = isRecord(filters.price) ? filters.price : {}
  const inventory = isRecord(filters.inventory) ? filters.inventory : {}

  return {
    page: normalizePositiveInteger(search.page, 1),
    pageSize: normalizePositiveInteger(search.pageSize, 24),
    sort: normalizeString(search.sort, 'relevance'),
    view: normalizeString(search.view, 'grid'),
    includeFacets: normalizeBoolean(search.includeFacets, true),
    filters: {
      categories: normalizeStringArray(
        filters.categories,
        defaultProductFilters.categories,
      ),
      tags: normalizeStringArray(filters.tags, defaultProductFilters.tags),
      price: {
        min: normalizePositiveInteger(
          price.min,
          defaultProductFilters.price.min,
        ),
        max: normalizePositiveInteger(
          price.max,
          defaultProductFilters.price.max,
        ),
      },
      inventory: {
        inStock: normalizeBoolean(
          inventory.inStock,
          defaultProductFilters.inventory.inStock,
        ),
        warehouses: normalizeStringArray(
          inventory.warehouses,
          defaultProductFilters.inventory.warehouses,
        ),
      },
      attributes: normalizeStringNumberBooleanRecord(
        filters.attributes,
        defaultProductFilters.attributes,
      ),
    },
  }
}

export function validateDetailSearch(
  search: Record<string, unknown>,
): DetailSearchValues {
  return {
    detailTab: normalizeString(search.detailTab, 'summary'),
    panel: normalizeString(search.panel, 'overview'),
    showInventory: normalizeBoolean(search.showInventory, true),
  }
}

export function validateCompareSearch(
  search: Record<string, unknown>,
): CompareSearchValues {
  const slots = isRecord(search.slots) ? search.slots : {}
  const matrix = isRecord(search.matrix) ? search.matrix : {}
  const normalizedSlots: Record<string, CompareSlot> = {}
  const normalizedMatrix: Record<string, Array<number>> = {}

  for (const [key, value] of Object.entries(slots)) {
    if (isRecord(value)) {
      normalizedSlots[key] = {
        id: normalizeString(value.id, key),
        priority: normalizePositiveInteger(value.priority, 1),
        pinned: normalizeBoolean(value.pinned, false),
      }
    }
  }

  for (const [key, value] of Object.entries(matrix)) {
    normalizedMatrix[key] = normalizeNumberArray(value, [1, 2, 3])
  }

  return {
    compareIds: normalizeStringArray(search.compareIds, [
      'sku-0001',
      'sku-0002',
    ]),
    slots: normalizedSlots,
    matrix: normalizedMatrix,
    includeRelated: normalizeBoolean(search.includeRelated, false),
    revision: normalizePositiveInteger(search.revision, 1),
  }
}

function buildFlags(index: number): ShopFlags {
  const cohort = pick(cohorts, index)
  const nextCohort = pick(cohorts, index + 2)

  return {
    preview: index % 3 === 0,
    cohorts: ['stable', cohort, nextCohort],
    weights: {
      stable: 1,
      [cohort]: (index % 5) + 1,
      [nextCohort]: (index % 7) + 2,
    },
  }
}

function buildProductFilters(index: number): ProductFilters {
  const random = createDeterministicRandom(0x9e3779b9 + index)
  const rating = 3 + Math.floor(random() * 3)
  const maxPrice = 180 + Math.floor(random() * 220)

  return {
    categories: [pick(categories, index), pick(categories, index + 2)],
    tags: [pick(tags, index), pick(tags, index + 3), pick(tags, index + 5)],
    price: {
      min: 20 + (index % 5) * 5,
      max: maxPrice,
    },
    inventory: {
      inStock: index % 4 !== 0,
      warehouses: [pick(warehouses, index), pick(warehouses, index + 3)],
    },
    attributes: {
      color: pick(productColors, index),
      rating,
      sustainable: index % 2 === 0,
      width: pick(['narrow', 'regular', 'wide'], index + 1),
    },
  }
}

export function buildProductsSearch(index: number): ProductsSearch {
  return {
    tenant: pick(tenantIds, index),
    locale: pick(locales, index + 1),
    flags: buildFlags(index),
    page: (index % 9) + 1,
    pageSize: pick([12, 24, 36, 48], index),
    sort: pick(sorts, index + 2),
    view: pick(views, index),
    includeFacets: index % 5 !== 0,
    filters: buildProductFilters(index),
    debug: index % 2 === 0,
    junk: `transient-${index}`,
  }
}

export function buildCompareSearch(index: number): CompareSearch {
  const base = buildProductsSearch(index + 11)
  const compareIds = Array.from(
    { length: 24 },
    (_, itemIndex) =>
      `sku-${String(index * 31 + itemIndex + 1).padStart(4, '0')}`,
  )
  const slots: Record<string, CompareSlot> = {}
  const matrix: Record<string, Array<number>> = {}

  compareIds.slice(0, 12).forEach((id, itemIndex) => {
    slots[`slot-${itemIndex}`] = {
      id,
      priority: (itemIndex % 5) + 1,
      pinned: itemIndex % 3 === 0,
    }
  })

  for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
    matrix[`metric-${rowIndex}`] = Array.from(
      { length: 6 },
      (_, columnIndex) => index * 17 + rowIndex * 5 + columnIndex,
    )
  }

  return {
    tenant: base.tenant,
    locale: base.locale,
    flags: base.flags,
    compareIds,
    slots,
    matrix,
    includeRelated: index % 2 === 0,
    revision: index + 1,
    debug: true,
    junk: `compare-junk-${index}`,
  }
}

function buildNavigationSet(index: number): SearchNavigationSet {
  const full = buildProductsSearch(index * 3)
  const nestedColors = productColors.filter(
    (color) => color !== full.filters.attributes.color,
  )
  const nested: ProductsSearch = {
    ...full,
    filters: {
      ...full.filters,
      attributes: {
        ...full.filters.attributes,
        color: pick(nestedColors, index),
      },
    },
  }
  const paged: ProductsSearch = {
    ...nested,
    page: nested.page + 1,
  }

  return {
    full,
    nested,
    paged,
    detail: {
      detailTab: pick(detailTabs, index),
      panel: pick(detailPanels, index + 1),
      showInventory: index % 2 === 0,
    },
    compare: buildCompareSearch(index),
    updater: buildProductsSearch(index * 3 + 1),
    productId: `sku-${String(index + 1).padStart(4, '0')}`,
  }
}

export const navigationSets = Array.from(
  { length: NAVIGATION_SET_COUNT },
  (_, index) => buildNavigationSet(index),
)

export const initialProductsSearch: ProductsSearch = {
  ...buildProductsSearch(97),
  debug: undefined,
  junk: undefined,
}

export const productsLinkSearch = buildProductsSearch(41)
export const compareLinkSearch = buildCompareSearch(17)

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch (_error) {
    return value
  }
}

export function parseJsonSearch(searchStr: string) {
  const params = new URLSearchParams(
    searchStr.startsWith('?') ? searchStr.slice(1) : searchStr,
  )
  const search: Record<string, unknown> = {}

  params.forEach((value, key) => {
    search[key] = parseJsonValue(value)
  })

  return search
}

export function stringifyJsonSearch(search: object) {
  const searchRecord = search as Record<string, unknown>
  const params = new URLSearchParams()

  for (const key of Object.keys(searchRecord).sort()) {
    const value = searchRecord[key]

    if (value !== undefined) {
      params.set(key, JSON.stringify(value))
    }
  }

  const value = params.toString()

  if (value.length === 0) {
    return ''
  }

  return `?${value}`
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item))
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {}

    for (const key of Object.keys(value).sort()) {
      const item = value[key]

      if (item !== undefined) {
        output[key] = stableValue(item)
      }
    }

    return output
  }

  return value
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value))
}

export function computeSearchChecksum(value: unknown) {
  const serialized = stableStringify(value)
  let seed = serialized.length | 0

  for (let index = 0; index < serialized.length; index++) {
    seed = (seed * 33 + serialized.charCodeAt(index)) >>> 0
  }

  for (let index = 0; index < 36; index++) {
    seed = (seed * 1664525 + 1013904223 + index) >>> 0
  }

  return seed
}

export function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    )
  }
}

export function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  label: string,
) {
  const actualValue = stableStringify(actual)
  const expectedValue = stableStringify(expected)

  if (actualValue !== expectedValue) {
    throw new Error(
      `${label}: expected ${expectedValue}, received ${actualValue}`,
    )
  }
}

export function assertNoTransientSearchKeys(
  search: Record<string, unknown>,
  label: string,
) {
  if ('debug' in search || 'junk' in search) {
    throw new Error(`${label}: transient search keys survived`)
  }
}

function assertMarker(
  container: HTMLElement,
  testId: string,
  expectedText: string,
) {
  const marker = container.querySelector(`[data-testid="${testId}"]`)

  if (!(marker instanceof HTMLElement)) {
    throw new Error(`Missing ${testId} marker`)
  }

  const text = marker.textContent ?? ''

  if (!text.includes(expectedText)) {
    throw new Error(
      `${testId}: expected text containing ${expectedText}, got ${text}`,
    )
  }
}

function assertCustomSearchRoundTrip() {
  const complexSearch = navigationSets[3]!.compare
  const roundTripped = parseJsonSearch(stringifyJsonSearch(complexSearch))

  assertDeepEqual(
    roundTripped,
    complexSearch,
    'custom search serializer round trip',
  )
}

export function createSearchParamsWorkload<TRouter extends AnyRouter>(
  framework: Framework,
  mountTestApp: MountTestApp<TRouter>,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp, timeoutMs: 4_000 })
  let stepIndex = 0

  function patchGlobalScrollTo() {
    const globalObject = globalThis as unknown as {
      scrollTo?: (...args: Array<unknown>) => void
    }
    const windowObject = window as unknown as {
      scrollTo?: (...args: Array<unknown>) => void
    }
    const hadScrollTo = Object.prototype.hasOwnProperty.call(
      globalObject,
      'scrollTo',
    )
    const previousScrollTo = globalObject.scrollTo

    if (typeof previousScrollTo === 'function') {
      return
    }

    globalObject.scrollTo = (...args: Array<unknown>) => {
      if (typeof windowObject.scrollTo === 'function') {
        windowObject.scrollTo(...args)
      }
    }

    lifecycle.addCleanup(() => {
      if (hadScrollTo) {
        globalObject.scrollTo = previousScrollTo
      } else {
        delete globalObject.scrollTo
      }
    })
  }

  async function before() {
    stepIndex = 0
    await lifecycle.before()
    patchGlobalScrollTo()
    await lifecycle.waitForLink('products-strip-link')
  }

  async function sanity() {
    assertCustomSearchRoundTrip()
    await lifecycle.before()
    patchGlobalScrollTo()

    try {
      await lifecycle.waitForLink('products-strip-link')
      const productsLink = await lifecycle.waitForLink('products-strip-link')
      const href = productsLink.getAttribute('href')

      if (!href) {
        throw new Error('products-strip-link did not generate an href')
      }

      if (href.includes('debug') || href.includes('junk')) {
        throw new Error(`products-strip-link retained transient keys: ${href}`)
      }

      const linkSearch = parseJsonSearch(
        new URL(href, 'https://router.test').search,
      )
      assertEqual(linkSearch.tenant, productsLinkSearch.tenant, 'link tenant')
      assertNoTransientSearchKeys(linkSearch, 'products link search')

      const set = navigationSets[2]!
      await lifecycle.navigate(
        {
          to: '/shop/products',
          search: set.full,
          replace: true,
        },
        { label: 'sanity products navigation' },
      )

      const productsSearch = lifecycle.getRouter().state.location
        .search as Record<string, unknown>
      assertNoTransientSearchKeys(productsSearch, 'products navigation search')
      assertEqual(productsSearch.tenant, set.full.tenant, 'products tenant')
      assertEqual(productsSearch.page, set.full.page, 'products page')
      assertMarker(lifecycle.getContainer(), 'products-marker', 'products:')

      await lifecycle.navigate(
        {
          to: '/shop/products/$productId',
          params: { productId: set.productId },
          replace: true,
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            ...set.detail,
          }),
        },
        { label: 'sanity detail navigation' },
      )
      assertMarker(lifecycle.getContainer(), 'detail-marker', set.productId)

      await lifecycle.navigate(
        {
          to: '/shop/compare',
          search: set.compare,
          replace: true,
        },
        { label: 'sanity compare navigation' },
      )

      const compareSearch = lifecycle.getRouter().state.location
        .search as Record<string, unknown>
      assertNoTransientSearchKeys(compareSearch, 'compare navigation search')
      assertEqual(
        (compareSearch.compareIds as Array<string>).length,
        set.compare.compareIds.length,
        'compare ids length',
      )
      assertMarker(lifecycle.getContainer(), 'compare-marker', 'compare:')
    } finally {
      await lifecycle.after()
    }
  }

  async function runStep() {
    const set =
      navigationSets[
        Math.floor(stepIndex / ACTION_SEQUENCE_LENGTH) % navigationSets.length
      ]!
    const actionIndex = stepIndex % ACTION_SEQUENCE_LENGTH
    stepIndex += 1

    if (actionIndex === 0) {
      await lifecycle.navigate(
        {
          to: '/shop/products',
          search: set.full,
          replace: true,
        },
        { label: 'run products full navigation' },
      )
      return
    }

    if (actionIndex === 1) {
      await lifecycle.navigate(
        {
          to: '/shop/products',
          search: set.nested,
          replace: true,
        },
        { label: 'run products nested navigation' },
      )
      return
    }

    if (actionIndex === 2) {
      await lifecycle.navigate(
        {
          to: '/shop/products',
          search: set.paged,
          replace: true,
        },
        { label: 'run products pagination navigation' },
      )
      return
    }

    if (actionIndex === 3) {
      await lifecycle.navigate(
        {
          to: '/shop/products/$productId',
          params: { productId: set.productId },
          replace: true,
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            ...set.detail,
          }),
        },
        { label: 'run product detail navigation' },
      )
      return
    }

    if (actionIndex === 4) {
      await lifecycle.navigate(
        {
          to: '/shop/compare',
          search: set.compare,
          replace: true,
        },
        { label: 'run compare navigation' },
      )
      return
    }

    await lifecycle.navigate(
      {
        to: '/shop/products',
        replace: true,
        search: (prev: Record<string, unknown>) => ({
          ...set.updater,
          tenant:
            typeof prev.tenant === 'string' ? prev.tenant : set.updater.tenant,
        }),
      },
      { label: 'run products updater navigation' },
    )
  }

  async function run() {
    for (let index = 0; index < NAVIGATIONS_PER_RUN; index++) {
      await runStep()
    }
  }

  return {
    name: `client search params loop (${framework})`,
    before,
    run,
    sanity,
    after: lifecycle.after,
  }
}
