/**
 * A failure of the Start compiler fails the build and tells the user which
 * module it is about, on every bundler, without hanging (SPEC G5, G11).
 * (The warning channel of today's compiler extension API is checked by the
 * implementation tests in `outside-compiler-corpus/start-build-warnings
 * .test.ts`.)
 */
import { describe, expect, test } from 'vitest'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: mutation round 3 sc-hosts 8 (on Rsbuild, the build hung forever
  // when the compiler's module resolution failed).
  test(
    'a server fn whose builder comes from a missing module fails the build, naming the module',
    async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      // A hanging build fails the test well before its timeout.
      const hang = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('the build hangs'), 20_000)
      })
      const outcome = await Promise.race([
        buildStart({
          bundler,
          files: {
            'src/fns.ts': `import { base } from './missing-base'
export const greet = base.handler(async () => 'MARK_HANDLER')
`,
            'src/entry.ts': `export { greet } from './fns'\n`,
          },
          entry: 'src/entry.ts',
        }).then(
          () => 'the build succeeds',
          // Everything the failed build reported, on every channel (a
          // compiler may print the details and fail with a short error)
          (error: unknown) =>
            error instanceof StartBuildError
              ? error.diagnostics.map(({ text }) => text).join('\n')
              : String(error),
        ),
        hang,
      ]).finally(() => clearTimeout(timer))
      expect(outcome).toContain('missing-base')
    },
    timeout,
  )
})
