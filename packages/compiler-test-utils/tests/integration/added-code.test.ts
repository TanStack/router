/**
 * Controls of the paired-build oracle (added-code.ts) on real minified
 * production builds: a renamed private helper adds nothing, a
 * development-only call made of names the bundle already has is added.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { addedCode } from '../../src/added-code'
import { bundleApp } from '../../src/build-harness'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const timeout = 60_000

/** An app whose entry calls a helper of another module. */
const app = (helper: string, entry: string) => ({
  'entry.ts': entry,
  'helper.ts': helper,
})

const controlFiles = app(
  `export function describeRoute(id: string) {
  console.warn('[route] ' + id)
  return { id, label: 'MARK_' + id }
}
`,
  `import { describeRoute } from './helper'
export function render(id: string) {
  const route = describeRoute(id)
  return route.label
}
`,
)

describe.each(['vite', 'rspack'] as const)('%s', (bundler) => {
  const build = (files: Record<string, string>, minify = true) =>
    bundleApp({
      dir: testsDir,
      registerCleanup: onTestFinished,
      bundler,
      env: 'client',
      minify,
      files,
    })

  test.each([true, false])(
    'a renamed private helper, printed otherwise, adds nothing (minify: %s)',
    async (minify) => {
      const renamed = await build(
        app(
          `export function routeInfo(routeId: string) {
  console.warn("[route] " + routeId);
  return { id: routeId, label: "MARK_" + routeId };
}
`,
          `import { routeInfo } from "./helper";
export function render(id: string) {
  const info = routeInfo(id);
  return info.label;
}
`,
        ),
        minify,
      )
      expect(addedCode(renamed, await build(controlFiles, minify))).toEqual([])
    },
    timeout,
  )

  test(
    'a development-only call made of names the bundle already has is added',
    async () => {
      const withDiagnostic = await build(
        app(
          controlFiles['helper.ts'],
          `import { describeRoute } from './helper'
export function render(id: string) {
  const route = describeRoute(id)
  console.warn('[route] ' + route.id)
  return route.label
}
`,
        ),
      )
      const control = await build(controlFiles)
      // The minifier merges the call into the statements around it.
      expect(
        addedCode(withDiagnostic, control).some((added) =>
          /console\.warn\(/.test(added.code),
        ),
      ).toBe(true)
    },
    timeout,
  )
})
