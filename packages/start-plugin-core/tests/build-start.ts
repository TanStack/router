/**
 * The serial opener of `build-harness.ts` (its own module: a module that
 * registers with the current test is serial as a whole, eslint.config.js).
 */
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { buildStartShared } from './build-harness'
import type { StartBuild, StartBuildOptions } from './build-harness'

/**
 * Builds the app with Start's plugin of `bundler` (client, then SSR) and
 * describes the output of each environment. Both results share the build's
 * console messages; warnings are per environment. The app is closed when
 * the current test finishes (`StartBuild.close`).
 */
export function buildStart(options: StartBuildOptions): Promise<StartBuild> {
  return closeAtEnd(
    () => buildStartShared(options),
    (opened) => opened.close(),
  )
}
