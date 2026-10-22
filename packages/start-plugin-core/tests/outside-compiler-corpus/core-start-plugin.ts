/**
 * Implementation tests only (outside the compiler corpus): Start's plugin
 * from the core factory (`tanStackStartVite`, `tanStackStartRsbuild`) with
 * the options a framework package passes, plus external import transforms
 * of the Start compiler (`compilerTransforms`). No public option takes
 * those: `@tanstack/react-start` passes its own (React's RSC CSS transforms,
 * with `rsc: { enabled: true }`), so a test of a synthetic transform
 * (`integration/outside-compiler-corpus/start-build-warnings.test.ts`)
 * needs the core factory. The harnesses use this only when a test passes
 * `compilerTransforms`; every corpus test gets `tanstackStart()` of the
 * framework package (`../start-plugins.ts`).
 *
 * What the framework package adds besides these options (React's `dedupe`,
 * externals and pre-bundling) is not here: an app built this way is not a
 * real app, which an implementation test of the hook accepts.
 */
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tanStackStartVite } from '@tanstack/start-plugin-core/vite'
import { tanStackStartRsbuild } from '@tanstack/start-plugin-core/rsbuild'
import type { StartCompilerImportTransform } from '../../src'
import type { HarnessEntries, StartPluginOptions } from '../start-plugins'

/**
 * The core options of the framework package, with the harness's entries as
 * its default entries (Start uses an app's own `src/client.*` and
 * `src/server.*` first) and a default start entry with the content of the
 * framework package's (written next to the harness's client entry).
 */
function coreOptions(
  framework: 'react' | 'solid',
  entries: Required<HarnessEntries>,
  compilerTransforms: Array<StartCompilerImportTransform>,
) {
  const start = path.join(path.dirname(entries.client), 'core-start.ts')
  if (!existsSync(start)) {
    writeFileSync(start, `export const startInstance = undefined\n`)
  }
  return {
    framework,
    defaultEntryPaths: {
      client: entries.client,
      server: entries.server,
      start,
    },
    providerEnvironmentName: 'ssr',
    ssrIsProvider: true,
    compilerTransforms,
  } as const
}

/** Start's Vite plugin from the core factory (see the module comment). */
export function coreStartPlugins(
  framework: 'react' | 'solid',
  start: StartPluginOptions,
  entries: Required<HarnessEntries>,
  compilerTransforms: Array<StartCompilerImportTransform>,
) {
  return tanStackStartVite(
    {
      ...coreOptions(framework, entries, compilerTransforms),
      ssrResolverStrategy: { type: 'default' },
    },
    start,
  )
}

/** Start's Rsbuild plugin from the core factory (see the module comment). */
export function coreStartRsbuildPlugin(
  framework: 'react' | 'solid',
  start: StartPluginOptions,
  entries: Required<HarnessEntries>,
  compilerTransforms: Array<StartCompilerImportTransform>,
) {
  return tanStackStartRsbuild(
    coreOptions(framework, entries, compilerTransforms),
    start,
  )
}
