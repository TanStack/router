/**
 * Pending ruling Q7 (REPAIR/BRIEF: "the CommonJS pin
 * known-bugs-start-compiler:1658"; SYNTHESIS Q7: reachability of a CommonJS
 * dependency through a supported plugin is not established). Moved
 * unchanged from known-bugs-start-compiler.test.ts:1652-1705 (workstream
 * B2). It compiles through the internal `StartCompiler` (the legacy
 * harness), held by Q7 until it is ruled.
 */
import { describe, expect, test } from 'vitest'
import { createStartCompiler } from '../outside-compiler-corpus/legacy/regression-helpers'

describe('CommonJS dependencies', () => {
  /** What the dependencies below are called with. */
  const app = { handler: (value: unknown) => ['handled', value] }

  // Bug: a module matching a detection pattern (`.handler(`) is parsed as strict ESM.
  // Impact: a sloppy-mode CommonJS dependency with such text fails the build.
  test.fails.each([
    {
      name: 'a legacy octal escape',
      id: '/test/node_modules/lib/index.cjs',
      code: `var reset = '\\033[0m'
module.exports = function (app) {
  return app.handler(reset)
}`,
      run: (cjs: { exports: any }) => cjs.exports(app),
    },
    {
      name: 'a with statement',
      id: '/test/node_modules/lib/index.cjs',
      code: `with (Math) {
  exports.run = function (app) {
    return app.handler(PI)
  }
}`,
      run: (cjs: { exports: any }) => cjs.exports.run(app),
    },
    {
      name: 'a top-level return',
      id: '/test/node_modules/lib/index.js',
      code: `if (typeof window === 'undefined') return
exports.run = function (app) {
  return app.handler(1)
}`,
      run: (cjs: { exports: any }) => cjs.exports.run,
    },
  ])(
    'a CommonJS dependency with $name compiles and keeps its meaning',
    async ({ id, code, run }) => {
      // Runs a CommonJS module (sloppy mode) and reads what `run` reads.
      const evaluate = (source: string) => {
        const cjs = { exports: {} as any }

        new Function('module', 'exports', source)(cjs, cjs.exports)
        return run(cjs)
      }
      for (const env of ['client', 'server'] as const) {
        const { compile } = createStartCompiler({ env })
        expect(evaluate((await compile(code, id)) ?? code), env).toEqual(
          evaluate(code),
        )
      }
    },
  )
})
