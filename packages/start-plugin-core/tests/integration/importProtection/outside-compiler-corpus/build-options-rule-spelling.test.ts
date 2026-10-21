/**
 * Implementation test, outside the compiler corpus: how today's import
 * protection spells a RegExp rule in its report (`String(regex)`,
 * `/^db-lib$/`). SPEC J6.12 and coupling N16 leave the spelling free; the
 * corpus test "a RegExp pattern is reported as the rule that matched"
 * (`../build-options.test.ts`) decides that the report names the rule (its
 * source, in any form). Split from that test (S6, B-mixed).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../../build-harness'
import {
  rejection,
  violationReports,
} from '../../../importProtection/start-apps'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a RegExp pattern is printed as String(pattern)',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'node_modules/db-lib/package.json': JSON.stringify({
              name: 'db-lib',
              type: 'module',
              exports: { '.': './index.js' },
            }),
            'node_modules/db-lib/index.js': `export const secret = () => 'MARK_SECRET'\n`,
            'src/entry.ts': `import { secret } from 'db-lib'
export const read = () => secret()
`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: { client: { specifiers: [/^db-lib$/] } },
          },
        }),
      )
      const reports = violationReports(error)
      expect(reports).not.toEqual([])
      for (const report of reports) {
        expect(report.text).toContain('/^db-lib$/')
      }
    },
    timeout,
  )
})
