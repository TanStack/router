import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

/**
 * The reports Rsbuild prints (`onAfterBuild`, once per build and per watch
 * rebuild; `onDevCompileDone`): the warnings of the compilations of each, as
 * Rsbuild reads them. `plugin` is an app's Rsbuild plugin.
 */
export function printedWarnings() {
  const reports: Array<Array<Diagnostic>> = []
  const record = (stats: Rspack.Stats | Rspack.MultiStats) => {
    const all = 'stats' in stats ? stats.stats : [stats]
    reports.push(
      all.flatMap((one) =>
        diagnosticsOf(
          one.toJson({ all: false, warnings: true }).warnings ?? [],
          'warning',
        ),
      ),
    )
  }
  const plugin: RsbuildPlugin = {
    name: 'test:printed-warnings',
    setup(api) {
      api.onAfterBuild(({ stats }) => stats && record(stats))
      api.onDevCompileDone(({ stats }) => record(stats))
    },
  }
  /** How many warnings of each report name `file` (from the app's `root`). */
  const counts = (root: string, file: string): Array<number> =>
    reports.map(
      (report) =>
        findDiagnostics(report, { severity: 'warning', file, root }).length,
    )
  return { plugin, reports, counts }
}
