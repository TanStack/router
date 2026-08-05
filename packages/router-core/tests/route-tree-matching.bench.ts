import { bench, describe, expect } from 'vitest'
import {
  findSingleMatch,
  processRouteTree,
} from '../src/new-process-route-tree'

const processedTree = processRouteTree({
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
}).processedTree

const staticRoute = '/a/b/c/d/e/f/g/h'
const optionalRoute = '/{-$a}/{-$b}/{-$c}/{-$d}/{-$e}/{-$f}/{-$g}/{-$h}/end'
const cases = [
  [staticRoute, staticRoute],
  [optionalRoute, '/1/2/3/4/5/6/7/8/end'],
  [optionalRoute, '/end'],
  [optionalRoute, '/1/2/3/end'],
] as const

for (const [route, path] of cases) {
  expect(
    findSingleMatch(route, false, false, path, processedTree)?.route.from,
  ).toBe(route)
}

let benchmarkSink = 0

function matchRepeatedly(route: string, path: string) {
  let matches = 0
  for (let i = 0; i < 100; i++) {
    if (findSingleMatch(route, false, false, path, processedTree)) {
      matches++
    }
  }
  benchmarkSink = matches
}

describe('route matching stack frames', () => {
  bench('match 100 deep static routes', () => {
    matchRepeatedly(staticRoute, staticRoute)
  })

  bench('match 100 routes with all optional segments present', () => {
    matchRepeatedly(optionalRoute, '/1/2/3/4/5/6/7/8/end')
  })

  bench('match 100 routes with all optional segments skipped', () => {
    matchRepeatedly(optionalRoute, '/end')
  })

  bench('match 100 routes with mixed optional segments', () => {
    matchRepeatedly(optionalRoute, '/1/2/3/end')
  })
})

void benchmarkSink
