import { bench, describe, expect } from 'vitest'
import { dehydrateSsrMatchId, hydrateSsrMatchId } from '../src/ssr/ssr-match-id'

const typicalIds = Array.from(
  { length: 100 },
  (_, index) =>
    `/$orgId/projects/$projectId/acme/projects/project-${index}{"page":${index}}`,
)
const deepIds = Array.from(
  { length: 100 },
  (_, index) =>
    `${Array.from({ length: 32 }, (__, depth) => `/route-${depth}`).join('')}/${index}`,
)
const reservedIds = Array.from(
  { length: 100 },
  (_, index) => `~/\0/\uFFFD/~0/~r/${index}`,
)
const normalizedDeepIds = deepIds.map((id) =>
  dehydrateSsrMatchId(id).replaceAll('\0', '\uFFFD'),
)
let benchmarkSink = 0

for (const id of [...typicalIds, ...deepIds, ...reservedIds]) {
  expect(hydrateSsrMatchId(dehydrateSsrMatchId(id))).toBe(id)
}

describe('SSR match ID codec', () => {
  bench('encode 100 typical match IDs', () => {
    let size = 0
    for (const id of typicalIds) {
      size += dehydrateSsrMatchId(id).length
    }
    benchmarkSink = size
  })

  bench('decode 100 normalized deep match IDs', () => {
    let size = 0
    for (const id of normalizedDeepIds) {
      size += hydrateSsrMatchId(id).length
    }
    benchmarkSink = size
  })

  bench('round-trip 100 reserved-character match IDs', () => {
    let size = 0
    for (const id of reservedIds) {
      size += hydrateSsrMatchId(dehydrateSsrMatchId(id)).length
    }
    benchmarkSink = size
  })
})

void benchmarkSink
