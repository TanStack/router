/**
 * Shared definition of the `route-tree-scale` scenario: route matching,
 * location building, and link-target resolution over a wide route tree
 * (~40 routes) mixing static segments, dynamic params, prefixed params,
 * splats, pathless layouts, and route groups. Navigations jump between
 * distant branches so matching cannot reuse the previous branch.
 */

export const sections = [
  'sec-a',
  'sec-b',
  'sec-c',
  'sec-d',
  'sec-e',
  'sec-f',
] as const

export const steps = [
  'go-sec-a-id',
  'go-sec-f-settings',
  'go-files',
  'go-release',
  'go-alpha',
  'go-promo',
  'go-sec-c-id',
  'go-sec-d-about',
  'go-home',
] as const

const expectedMarkers = [
  'sec-a:11',
  'sec-f:settings',
  'files:x/y/z',
  'release:9',
  'alpha',
  'promo',
  'sec-c:42',
  'sec-d:about',
  'home',
] as const

export function assertStepResult(stepIndex: number) {
  const expected = expectedMarkers[stepIndex]!
  const actual = document.querySelector(
    '[data-testid="scale-state"]',
  )?.textContent
  if (actual !== expected) {
    throw new Error(
      `Expected scale-state marker "${expected}" after step ${stepIndex}, received "${actual}"`,
    )
  }
}

// Three laps through the 9-step sequence per benchmark iteration.
export const ticksPerIteration = 27

export const benchOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
}
