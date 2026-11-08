/**
 * Runs the process under `NODE_ENV=development`, as `vite dev` and
 * `rsbuild dev` run an app (each sets it when it is unset): Vitest's `test`
 * is not a dev server's environment. It stays set while the process's dev
 * servers run (the code they serve reads it on each request); the test file's
 * environment comes back after the file (`./test-scope-setup`).
 */
export function runAsDevCommand() {
  process.env.NODE_ENV = 'development'
}
