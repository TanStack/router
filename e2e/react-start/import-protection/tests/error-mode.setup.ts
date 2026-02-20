import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import type { FullConfig } from '@playwright/test'

/**
 * Global setup for error-mode E2E tests.
 *
 * Runs `BEHAVIOR=error pnpm build` and captures the output + exit code.
 * The build is *expected* to fail because `behavior: 'error'` causes the
 * import-protection plugin to call `this.error()` on the first violation,
 * which aborts the Vite/Rollup build with a non-zero exit code.
 *
 * Results are written to `error-build-result.json` for the spec to read.
 */
export default async function globalSetup(config: FullConfig) {
  void config
  const cwd = path.resolve(import.meta.dirname, '..')
  const outFile = path.resolve(cwd, 'error-build-result.json')

  // Clean up from previous runs.
  for (const f of ['error-build-result.json', 'error-build.log']) {
    const p = path.resolve(cwd, f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }

  let stdout = ''
  let stderr = ''
  let exitCode = 0

  try {
    const output = execSync('pnpm build', {
      cwd,
      env: {
        ...process.env,
        BEHAVIOR: 'error',
      },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    stdout = output
  } catch (err: any) {
    // execSync throws on non-zero exit code — this is the *expected* path.
    exitCode = err.status ?? 1
    stdout = err.stdout ?? ''
    stderr = err.stderr ?? ''
  }

  const combined = `${stdout}\n${stderr}`

  // Persist the log for debugging.
  fs.writeFileSync(path.resolve(cwd, 'error-build.log'), combined)

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        exitCode,
        stdout,
        stderr,
        combined,
      },
      null,
      2,
    ),
  )
}
