/**
 * Glue of the V2 import-protection tests (`v2-*.test.ts`) that run an app on
 * a real host: what a dev server or build reports, read through the
 * violation report adapter (`violation-report.ts`), and the Rsbuild dev
 * server's SSR output run in Node.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { reportedViolations } from '../../importProtection/start-apps'
import type { ReportOutput } from '../../importProtection/violation-report'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

/**
 * The importers of the violations reported for `environment` (`client` or
 * `server`) in `output` (text, log entries, or an Rsbuild dev server's
 * `diagnostics`), without their locations, each once, sorted.
 */
export function reportedImporters(
  output: ReportOutput,
  environment: 'client' | 'server',
): Array<string> {
  return [
    ...new Set(
      reportedViolations(output)
        .filter((violation) => violation.environment === environment)
        .map(({ importer }) => importer.replace(/:\d+:\d+$/, '')),
    ),
  ].sort()
}

/**
 * Runs the SSR output of an Rsbuild dev server with Start's plugin (a
 * CommonJS bundle for Node) in a fresh VM context, as Node loads the
 * server, then `script` (the body of an async function) in the same
 * context. Returns what the script returns (`result`), or the message of
 * what it throws (`error`). The context's console is this process's.
 */
export async function runRsbuildSsr(
  server: Pick<RsbuildDevServer, 'outputs' | 'root'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  const commonJs = { exports: {} }
  const context = vm.createContext({
    console,
    module: commonJs,
    exports: commonJs.exports,
    require: createRequire(path.join(server.root, 'index.js')),
  })
  context.globalThis = context
  for (const code of Object.values(await server.outputs('ssr'))) {
    vm.runInContext(code, context)
  }
  try {
    const run = vm.runInContext(
      `(async () => {\n${script}\n})`,
      context,
    ) as () => Promise<unknown>
    return { result: await run() }
  } catch (error) {
    // errors of the VM context are not `instanceof Error` here
    return {
      error:
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error),
    }
  }
}
