import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export const STATIC_ROUTE_COUNT = 80
export const DYNAMIC_ROUTE_COUNT = 40
export const OPTIONAL_ROUTE_COUNT = 24
export const SPLAT_ROUTE_COUNT = 8
export const PATHLESS_CHAIN_COUNT = 4
export const PATHLESS_CHAIN_DEPTH = 4
export const ROUTE_MATCHING_CYCLE_COUNT = 4
export const ROUTE_MATCHING_NAVIGATION_COUNT = ROUTE_MATCHING_CYCLE_COUNT * 10

export const ROUTE_MATCHING_ROUTE_COUNTS = {
  static: STATIC_ROUTE_COUNT,
  dynamic: DYNAMIC_ROUTE_COUNT,
  optional: OPTIONAL_ROUTE_COUNT,
  splat: SPLAT_ROUTE_COUNT,
  pathlessChains: PATHLESS_CHAIN_COUNT,
  pathlessChainDepth: PATHLESS_CHAIN_DEPTH,
} as const

export const INITIAL_ROUTE_PATH = '/catalog/products/static-0'

export type RouteKind =
  | 'static'
  | 'dynamic'
  | 'optional'
  | 'splat'
  | 'priority-primary'
  | 'priority-fallback'
  | 'case-sensitive'
  | 'reserved-param'
  | 'pathless'
  | 'not-found'

export interface RouteMarker {
  kind: RouteKind
  value: string
}

export interface RouteMatchingLocation {
  to: string
  params?: Record<string, unknown>
  expected: RouteMarker
  hrefIncludes?: string
  wait?: 'rendered' | 'resolved' | 'idle' | 'none'
}

export function createRouteMarker(kind: RouteKind, value: string): RouteMarker {
  return {
    kind,
    value: `${kind}:${value}`,
  }
}

export const INITIAL_ROUTE_MARKER = createRouteMarker('static', 'static-0')

export function normalizeNumericId(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return Math.trunc(parsed)
}

export function normalizeSlug(value: unknown) {
  const text = typeof value === 'string' ? value : ''
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@:+-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'empty'
}

function pickIndex(random: () => number, count: number) {
  return Math.floor(random() * count)
}

export function createRouteMatchingLocations() {
  const random = createDeterministicRandom(0x5eed_0202)
  const locations: Array<RouteMatchingLocation> = []

  for (let cycle = 0; cycle < ROUTE_MATCHING_CYCLE_COUNT; cycle++) {
    const staticIndex = 1 + pickIndex(random, STATIC_ROUTE_COUNT - 1)
    const dynamicIndex = pickIndex(random, DYNAMIC_ROUTE_COUNT)
    const optionalWithIndex = pickIndex(random, OPTIONAL_ROUTE_COUNT)
    const optionalWithoutIndex = (optionalWithIndex + 7) % OPTIONAL_ROUTE_COUNT
    const splatIndex = pickIndex(random, SPLAT_ROUTE_COUNT)
    const pathlessIndex = cycle % PATHLESS_CHAIN_COUNT
    const numericId = 1_000 + pickIndex(random, 9_000)
    const category = `cat-${randomSegment(random)}`
    const section = `sec-${randomSegment(random)}`
    const slugWithSection = `slug-${randomSegment(random)}`
    const slugWithoutSection = `slug-${randomSegment(random)}`
    const splat = [
      `folder-${randomSegment(random)}`,
      `topic-${randomSegment(random)}`,
      `file-${randomSegment(random)}`,
    ].join('/')
    const fallbackValue = `fallback-${randomSegment(random)}`
    const caseCode = `case-${randomSegment(random)}`
    const reservedSlug = `scope@team:${randomSegment(random)}`

    locations.push(
      {
        to: `/catalog/products/static-${staticIndex}`,
        expected: createRouteMarker('static', `static-${staticIndex}`),
      },
      {
        to: `/catalog/products/dyn-${dynamicIndex}/$category/$id`,
        params: {
          category,
          id: numericId,
        },
        expected: createRouteMarker('dynamic', `dynamic-${dynamicIndex}`),
      },
      {
        to: `/docs/topic-${optionalWithIndex}/{-$section}/$slug`,
        params: {
          section,
          slug: slugWithSection,
        },
        expected: createRouteMarker(
          'optional',
          `optional-${optionalWithIndex}`,
        ),
      },
      {
        to: `/docs/topic-${optionalWithoutIndex}/{-$section}/$slug`,
        params: {
          slug: slugWithoutSection,
        },
        expected: createRouteMarker(
          'optional',
          `optional-${optionalWithoutIndex}`,
        ),
      },
      {
        to: `/files/bucket-${splatIndex}/$`,
        params: {
          _splat: splat,
        },
        expected: createRouteMarker('splat', `splat-${splatIndex}`),
      },
      {
        to: `/priority/${fallbackValue}`,
        expected: createRouteMarker('priority-fallback', 'fallback'),
      },
      {
        to: '/case/Sensitive/$code',
        params: {
          code: caseCode,
        },
        expected: createRouteMarker('case-sensitive', 'case-sensitive'),
      },
      {
        to: '/reserved/$slug',
        params: {
          slug: reservedSlug,
        },
        expected: createRouteMarker('reserved-param', 'reserved-param'),
        hrefIncludes: 'scope@team:',
      },
      {
        to: `/pathless/chain-${pathlessIndex}/leaf`,
        expected: createRouteMarker('pathless', `pathless-${pathlessIndex}`),
      },
      {
        to: `/missing/${cycle}/${randomSegment(random)}`,
        expected: createRouteMarker('not-found', 'not-found'),
        wait: 'idle',
      },
    )
  }

  return locations
}
