/**
 * Rsbuild dev, `behavior: 'error'`: a denied file reached as an asset by an
 * import the compiler does not read (`import.meta.webpackContext` of
 * `?raw`). The asset's failure is import protection's error, located at the
 * denied file, as a module's is (its record holds the located errors: the
 * asset and the module outcomes map to one record), not a loader's crash.
 * Source: Fable's and Astra's reviews of settlement step 4 (Fable finding
 * 1, `probe-asset-dev-error.test.ts`; Astra finding 4).
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import { app, byFileRule, webpackContext } from './asset-query-app'

test('rsbuild dev: a denied asset fails at the denied file', async () => {
  const server = await startRsbuildDevServer({
    compileTimeout: 60_000,
    importProtection: { behavior: 'error' },
    files: app(webpackContext('/secrets.*\\.ts$/'), byFileRule),
  })
  expect(server.errors.length).toBeGreaterThan(0)
  // (Rspack's own wrapper of an error a loader threw, which a located
  // record replaces)
  expect(server.errors.filter((e) => /Module build failed/.test(e))).toEqual([])
  expectDiagnostic(server.diagnostics, {
    severity: 'error',
    file: 'src/secrets.server.ts',
    root: server.root,
  })
}, 120_000)
