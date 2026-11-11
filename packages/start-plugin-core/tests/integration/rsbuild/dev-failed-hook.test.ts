/**
 * A failure inside one of Start's hooks of an Rsbuild dev compilation (here
 * the app's `onViolation`, which Start calls when a compilation keeps a
 * module with a violation, with `log: 'always'`) fails that compilation
 * only: it is reported, and the next edit is built and served.
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'

const timeout = 60_000

test(
  'a failed hook fails one compilation, and the next edit is built (Rsbuild dev)',
  async () => {
    let armed = false
    let failed = false
    const server = await startRsbuildDevServer({
      compileTimeout: timeout,
      importProtection: {
        log: 'always',
        onViolation: () => {
          if (armed) {
            armed = false
            failed = true
            throw new Error('the app callback failed')
          }
        },
      },
      files: {
        'src/secret.server.js': `export const secret = 'MARK_SERVER_SECRET'\n`,
        'src/page.ts': `import { secret } from './secret.server.js'\nexport const page = () => secret\n`,
        'src/other.ts': `export const other = 'MARK_OTHER_0'\n`,
        'src/entry.ts': `import { page } from './page'\nimport { other } from './other'\nconsole.log(page(), other)\n`,
      },
    })
    armed = true
    const since = server.diagnostics.length
    await server.edit({
      'src/other.ts': `export const other = 'MARK_OTHER_1'\n`,
    })
    // (the callback failed, in a compilation that kept `page.ts`)
    expect(failed).toBe(true)
    expectDiagnostic(server.diagnostics.slice(since), { severity: 'error' })
    await server.edit({
      'src/other.ts': `export const other = 'MARK_OTHER_2'\n`,
    })
    expect(server.errors).toEqual([])
    expect(Object.values(await server.outputs()).join('\n')).toContain(
      'MARK_OTHER_2',
    )
  },
  timeout,
)
