/**
 * Not part of the compiler test corpus (out of scope: import protection's
 * opt-in perf/debug report, `TSR_IMPORT_PROTECTION_PERF`, documented only in
 * src/vite/import-protection-plugin/INTERNALS.md; it changes nothing a build
 * outputs). Moved from importProtection/build-options.test.ts (audit F).
 */
import { afterEach, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

afterEach(() => {
  vi.unstubAllEnvs()
})

// Import protection's opt-in perf report: "Output is written as cumulative
// JSON to TSR_IMPORT_PROTECTION_PERF_FILE when set. Without that file,
// output is logged" (src/vite/import-protection-plugin/INTERNALS.md).
// Source: r5-gaps borderline spc:4025 (Vite), 7038 (Rsbuild): the report
// written to an unset file, which throws.
test.each(startBundlers)(
  '%s build with TSR_IMPORT_PROTECTION_PERF=1 and no report file builds and logs the perf report',
  async (bundler) => {
    vi.stubEnv('TSR_IMPORT_PROTECTION_PERF', '1')
    vi.stubEnv('TSR_IMPORT_PROTECTION_PERF_FILE', undefined)
    const built = await buildStart({
      bundler,
      files: {
        'src/a.ts': `export const read = () => 'MARK_PLAIN'\n`,
        'src/entry.ts': `export * from './a'\n`,
      },
      entry: 'src/entry.ts',
    })
    expect(built.client.consoleMessages).toContainEqual(
      expect.stringContaining('[import-protection:perf]'),
    )
  },
  60_000,
)
