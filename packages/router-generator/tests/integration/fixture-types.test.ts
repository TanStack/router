/**
 * The types of the generator fixtures' route trees (SPEC J1.13): with types
 * enabled, each tree types the routes of generator-fixtures.ts (the routes
 * the real router builds from it, generator.test.ts) alike: the same route
 * ids, and for each route the same full path and parent. Checked by the
 * real TypeScript compiler with the real router types, on a copy of the
 * fixture.
 *
 * Slow tier: each tree augments the router's types globally
 * (`declare module '@tanstack/react-router'`), so each needs a program of
 * its own (about 0.2 s each).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { Generator } from '../../src'
import {
  conflictingFiles,
  copyFixture,
  fixtureConfig,
  fixtureNames,
  prepareFixture,
} from '../generator-fixture'
import { fixtureRoutes } from '../generator-fixtures'
import { routeTypeChecks } from '../real-router'
import { typeErrorsOfModules } from '../type-check'

/**
 * Generates the fixture `name` in a copy and returns the type errors of a
 * module asserting that its tree types the fixture's routes.
 */
async function typeErrorsOfFixture(name: string) {
  const dir = await copyFixture(name)
  // (temporary files on the copy's filesystem)
  const config = { ...fixtureConfig(name, dir), tmpDir: path.join(dir, 'tmp') }
  await prepareFixture(name, dir)
  await new Generator({ config, root: dir }).run()
  const checks = path.join(dir, 'route-checks.ts')
  await fs.writeFile(
    checks,
    routeTypeChecks(
      `./${path.relative(dir, config.generatedRouteTree).replace(/\.ts$/, '')}`,
      fixtureRoutes[name]!,
    ),
  )
  // (the checks compare string literal types only: no DOM types needed,
  // which halves the time of a program)
  return typeErrorsOfModules([checks], ['lib.es2022.d.ts']).get(checks)
}

/**
 * Fixtures whose tree types a route otherwise than the router: the bug,
 * pinned below.
 */
const knownTypeBugs = new Set([
  'nested-route-groups-with-layouts-before-physical',
  'route-groups',
])

const names = (await fixtureNames()).filter(
  (name) =>
    !conflictingFiles(name) &&
    !fixtureConfig(name).disableTypes &&
    !knownTypeBugs.has(name),
)

describe('the types of the generator fixtures', () => {
  test.each(names)(
    'the "%s" route tree types its routes like the router',
    async (name) => {
      expect(await typeErrorsOfFixture(name)).toEqual([])
    },
  )

  // Bug: a pathless layout in a route group directory
  // (`(group-a)/_layout-a.tsx`, `(bar)/_bar.tsx`) is typed with
  // `fullPath: ''` while the router gives it `/` (the same bug as the
  // group layout pin of real-router.test.ts, `(marketing)/route.tsx`).
  // Source: src/utils.ts:929-950 (`inferFullPath`: `/(group-a)/_layout-a`
  // without its layout segment and group is `/`, which is no index path, so
  // its trailing slash is dropped).
  // Impact: `Route.fullPath` and the types derived from it (`from` of links
  // and hooks) say `''` in such a layout while the app sees `/`.
  test.fails.each([...knownTypeBugs])(
    'the "%s" route tree types its routes like the router',
    async (name) => {
      expect(await typeErrorsOfFixture(name)).toEqual([])
    },
  )
})
