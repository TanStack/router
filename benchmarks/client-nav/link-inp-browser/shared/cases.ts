/**
 * Workloads shared by the React, Solid and Vue apps. They mirror the `lane-*` cases
 * of `../link-performance/cases.ts`: 1,000 measured Links rendered by the
 * staying `/lane` layout and/or the `/lane/a` leaf, while a control Link
 * navigates `/lane/a` <-> `/lane/b` (`/lane/b` renders no Links), so `/lane/a`
 * departs on every other navigation.
 */
export const CASES = [
  'lane-departing',
  'lane-departing-updaters',
  'lane-retained',
  'lane-mixed',
] as const

export type CaseId = (typeof CASES)[number]

export interface PageConfig {
  caseId: CaseId
  /** Delay of the `/lane/a` and `/lane/b` loaders; 0 renders without loaders. */
  loaderMs: number
}

declare global {
  interface Window {
    __LINK_INP_CONFIG__?: PageConfig
  }
}

export function readConfig(): PageConfig {
  const config = window.__LINK_INP_CONFIG__
  if (!config || !CASES.includes(config.caseId)) {
    throw new Error('Missing or invalid window.__LINK_INP_CONFIG__')
  }
  return config
}

export function laneLinkCounts(caseId: CaseId): [layout: number, leaf: number] {
  switch (caseId) {
    case 'lane-departing':
    case 'lane-departing-updaters':
      return [0, 1_000]
    case 'lane-retained':
      return [1_000, 0]
    case 'lane-mixed':
      return [500, 500]
  }
}

export const isUpdaterCase = (caseId: CaseId) =>
  caseId === 'lane-departing-updaters'

/** 20 Links per 1,000 target each leaf, so 40 flip active per navigation. */
export function laneFixedTarget(index: number) {
  return index % 50 === 0 ? '/lane/a' : index % 50 === 1 ? '/lane/b' : undefined
}

export const LANE_INDEXES = Array.from({ length: 1_000 }, (_, index) => index)

/** Loader of the `/lane/a` and `/lane/b` leaves in the loader variant. */
export function leafLoader(loaderMs: number) {
  return loaderMs > 0
    ? () => new Promise<void>((resolve) => setTimeout(resolve, loaderMs))
    : undefined
}
