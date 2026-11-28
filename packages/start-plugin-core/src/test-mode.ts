/**
 * Whether a bundler config is being resolved by Vitest in order to run tests.
 *
 * Vitest resolves its config with the `serve` command and, unless the user
 * picks another one, the `test` mode. `process.env.VITEST` alone is not
 * enough: it is also set in the processes that run the test files, where a
 * test may start a real dev server or a build of the app.
 */
export function isVitestRun(env: { command: string; mode: string }): boolean {
  return env.command === 'serve' && env.mode === 'test' && !!process.env.VITEST
}
