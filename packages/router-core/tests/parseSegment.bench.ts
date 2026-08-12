import { bench, describe, expect } from 'vitest'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  parseSegment,
} from '../src/new-process-route-tree'

const iterations = 10_000
const mixedPath =
  '/organizations/$organizationId/projects/$projectId/settings'
const staticPath = '/organizations/projects/settings/members/activity'
const deepStaticPath = `/${Array.from(
  { length: 32 },
  (_, index) => `segment-${index}`,
).join('/')}`
const bracedPath =
  '/organizations/prefix{$organizationId}/projects/{-$projectId}/settings'
let benchmarkSink = 0

function segmentTypes(path: string) {
  const types: Array<number> = []
  const output = new Uint16Array(6)
  let cursor = 0
  while (cursor < path.length) {
    const segment = parseSegment(path, cursor, output)
    types.push(segment[0])
    cursor = segment[5] + 1
  }
  return types
}

expect(segmentTypes(mixedPath)).toEqual([
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
])
expect(segmentTypes(staticPath)).toEqual([
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
])
expect(segmentTypes(deepStaticPath)).toHaveLength(33)
expect(segmentTypes(deepStaticPath)).toEqual(
  Array<number>(33).fill(SEGMENT_TYPE_PATHNAME),
)
expect(segmentTypes(bracedPath)).toEqual([
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PATHNAME,
])

function parsePathBatch(path: string) {
  const output = new Uint16Array(6)
  let checksum = 0
  for (let index = 0; index < iterations; index++) {
    let cursor = 0
    while (cursor < path.length) {
      const segment = parseSegment(path, cursor, output)
      checksum += segment[0] + segment[2] + segment[3]
      cursor = segment[5] + 1
    }
  }
  benchmarkSink = checksum
}

describe('parseSegment', () => {
  bench('mixed static and parameter segments', () => {
    parsePathBatch(mixedPath)
  })

  bench('all-static segments', () => {
    parsePathBatch(staticPath)
  })

  bench('deep all-static segments', () => {
    parsePathBatch(deepStaticPath)
  })

  bench('braced parameter segments', () => {
    parsePathBatch(bracedPath)
  })
})

void benchmarkSink
