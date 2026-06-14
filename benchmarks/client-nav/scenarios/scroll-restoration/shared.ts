import type { ParsedLocation } from '@tanstack/router-core'
import { createDeterministicRandom } from '#client-nav/bench-utils'

export const SCROLL_ROUTE_PATHS = {
  root: '/scroll',
  list: '/scroll/list/$listId',
  detail: '/scroll/list/$listId/detail/$itemId',
  static: '/scroll/static',
  listChild: 'list/$listId',
  detailChild: 'detail/$itemId',
  staticChild: 'static',
} as const

export const SCROLL_START_PATH = SCROLL_ROUTE_PATHS.root

export type ScrollPage = 'scroll' | 'list' | 'detail' | 'static'

export const SCROLL_CONTAINER_IDS = {
  root: 'scroll-root-container',
  resetPanel: 'scroll-reset-panel',
  sidebar: 'scroll-sidebar-panel',
  list: 'scroll-list-container',
  detail: 'scroll-detail-container',
  static: 'scroll-static-container',
} as const

export const SCROLL_CONTAINER_ID_LIST = [
  SCROLL_CONTAINER_IDS.root,
  SCROLL_CONTAINER_IDS.resetPanel,
  SCROLL_CONTAINER_IDS.sidebar,
  SCROLL_CONTAINER_IDS.list,
  SCROLL_CONTAINER_IDS.detail,
  SCROLL_CONTAINER_IDS.static,
] as const

export type ScrollContainerId = (typeof SCROLL_CONTAINER_ID_LIST)[number]
export type ScrollTargetId = 'window' | ScrollContainerId
export type ScrollContainerKey = keyof typeof SCROLL_CONTAINER_IDS

export const scrollFillerRows = Array.from({ length: 18 }, (_, index) => index)
export const scrollSidebarRows = scrollFillerRows.slice(0, 6)

export interface ScrollPosition {
  scrollLeft: number
  scrollTop: number
}

export type ScrollPositions = Partial<Record<ScrollTargetId, ScrollPosition>>

export interface ScrollCycleInput {
  listId: string
  detailAId: string
  detailBId: string
  hashId: string
  listPositions: ScrollPositions
  detailPositions: ScrollPositions
  detailHashPositions: ScrollPositions
  detailBPositions: ScrollPositions
}

const seededPositions = createDeterministicRandom(0x5eed_120c)

const cycleIds = [
  { listId: 'a', detailAId: 'alpha', detailBId: 'beta' },
  { listId: 'b', detailAId: 'gamma', detailBId: 'delta' },
] as const

function createPosition(base: number): ScrollPosition {
  return {
    scrollLeft: base + Math.floor(seededPositions() * 41),
    scrollTop: base * 9 + 120 + Math.floor(seededPositions() * 211),
  }
}

function createPositions(base: number): ScrollPositions {
  return {
    window: createPosition(base),
    [SCROLL_CONTAINER_IDS.root]: createPosition(base + 3),
    [SCROLL_CONTAINER_IDS.resetPanel]: createPosition(base + 5),
    [SCROLL_CONTAINER_IDS.sidebar]: createPosition(base + 7),
    [SCROLL_CONTAINER_IDS.list]: createPosition(base + 11),
    [SCROLL_CONTAINER_IDS.detail]: createPosition(base + 13),
    [SCROLL_CONTAINER_IDS.static]: createPosition(base + 17),
  }
}

export const scrollCycles: ReadonlyArray<ScrollCycleInput> = cycleIds.map(
  (ids, index) => ({
    ...ids,
    hashId: getHashAnchorId(ids.detailAId),
    listPositions: createPositions(20 + index * 40),
    detailPositions: createPositions(30 + index * 40),
    detailHashPositions: createPositions(40 + index * 40),
    detailBPositions: createPositions(50 + index * 40),
  }),
)

export function getHashAnchorId(itemId: string) {
  return `scroll-anchor-${itemId}`
}

export function getScrollRestorationKey(location: ParsedLocation) {
  return location.pathname
}

export function getScrollRestorationSelector(id: ScrollContainerId) {
  return `[data-scroll-restoration-id="${id}"]`
}

export function createScrollToTopSelectors() {
  return [
    getScrollRestorationSelector(SCROLL_CONTAINER_IDS.resetPanel),
    getScrollRestorationSelector(SCROLL_CONTAINER_IDS.list),
    () =>
      document.querySelector(
        getScrollRestorationSelector(SCROLL_CONTAINER_IDS.detail),
      ),
  ]
}

export function normalizeScrollSegment(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

export function parseScrollListParams(params: { listId: string }) {
  return {
    listId: normalizeScrollSegment(params.listId, 'missing-list'),
  }
}

export const stringifyScrollListParams = parseScrollListParams

export function parseScrollDetailParams(params: { itemId: string }) {
  return {
    itemId: normalizeScrollSegment(params.itemId, 'missing-item'),
  }
}

export const stringifyScrollDetailParams = parseScrollDetailParams

export function runScrollRenderComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 24; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}
