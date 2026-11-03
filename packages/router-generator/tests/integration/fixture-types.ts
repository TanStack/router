/**
 * Shared test helper of fixture-types-*.test.ts: the types of the generator
 * fixtures' route trees (SPEC J1.13). With types enabled, each tree types
 * the routes of generator-fixtures.ts (the routes the real router builds
 * from it, generator.test.ts) alike: the same route ids, and for each route
 * the same full path and parent. Checked by the real TypeScript compiler
 * with the real router types, on a copy of the fixture.
 *
 * Slow tier: each tree augments the router's types globally
 * (`declare module '@tanstack/react-router'`), so each needs a program of
 * its own (about 0.2 s each); the fixtures are split over two files.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
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
export async function typeErrorsOfFixture(name: string) {
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
 * pinned in fixture-types-physical.test.ts.
 */
export const knownTypeBugs = new Set([
  'nested-route-groups-with-layouts-before-physical',
  'route-groups',
])

/**
 * The fixtures with types to check (no conflicting routes, types enabled)
 * and without a known types bug.
 */
export async function typedFixtureNames() {
  return (await fixtureNames()).filter(
    (name) =>
      !conflictingFiles(name) &&
      !fixtureConfig(name).disableTypes &&
      !knownTypeBugs.has(name),
  )
}
