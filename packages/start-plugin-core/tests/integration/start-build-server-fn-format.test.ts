/**
 * The server-fn ids and metadata a production build prints are the
 * formats earlier Start versions printed (`server-fns/format.ts`; SPEC
 * J4.4 "Output formats"): tooling that reads the server bundle keeps
 * working. The golden app (`server-fn-format-golden.ts`) builds with Vite
 * and Rsbuild, without a generator and with a custom one; what its output
 * holds about each server fn (the manifest's entries, the
 * `createServerRpc` metadata, the ids the client calls), as raw literal
 * text, equals what `main` printed for the same app
 * (`fixtures/server-fn-format-main/main-formats.json`, recorded from real
 * builds of `main`: see `record.mjs` there).
 *
 * One difference is intended: a server fn only other handlers call is not
 * in the manifest (J4.2; `main`'s Rsbuild build listed it, so anyone could
 * call it over HTTP, and `main`'s Vite build had no provider for it, so
 * the SSR call failed).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import {
  extractServerFnFormat,
  goldenClientImports,
  goldenFiles,
  goldenGenerateFunctionId,
  literalValue,
  serverOnlyFunctionNames,
} from '../server-fn-format-golden'
import golden from './fixtures/server-fn-format-main/main-formats.json'
import type { ServerFnFormatRecord } from '../server-fn-format-golden'

const timeout = 60_000

const entry = `${Object.entries(goldenClientImports)
  .map(([from, names]) => `export { ${names.join(', ')} } from '${from}'`)
  .join('\n')}\n`

function jsFiles(dir: string): Array<string> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.[cm]?js$/.test(e.name))
    .map((e) => readFileSync(path.join(e.parentPath, e.name), 'utf8'))
}

const serverOnlyNames = new Set(
  serverOnlyFunctionNames.map((name) =>
    name.replace(/_createServerFn_handler$/, ''),
  ),
)

/** `main`'s record with the intended difference applied. */
function expected(
  bundler: 'vite' | 'rsbuild',
  mode: 'none' | 'custom',
): ServerFnFormatRecord {
  const main = golden.records[bundler][mode] as ServerFnFormatRecord
  const isServerOnly = (raw: string) => serverOnlyNames.has(literalValue(raw))
  return {
    manifest: main.manifest.filter(
      (e) => !serverOnlyFunctionNames.includes(literalValue(e.functionName)),
    ),
    // every build has the server-only fn's provider (main's Vite build had
    // none: its metadata is the one main's Rsbuild build printed)
    meta: [
      ...main.meta.filter((m) => !isServerOnly(m.name)),
      ...(golden.records.rsbuild[mode] as ServerFnFormatRecord).meta.filter(
        (m) => isServerOnly(m.name),
      ),
    ].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1,
    ),
    clientIds: main.clientIds,
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(['none', 'custom'] as const)(
    "prints main's server-fn ids and metadata (generator: %s)",
    async (mode) => {
      const build = await buildStart({
        bundler,
        files: { ...goldenFiles, 'src/entry.ts': entry },
        entry: 'src/entry.ts',
        // as a Start app's server bundle (the client's ids are the same)
        minify: false,
        start:
          mode === 'custom'
            ? { serverFns: { generateFunctionId: goldenGenerateFunctionId } }
            : {},
      })
      expect(
        extractServerFnFormat(
          jsFiles(build.ssr.outDir),
          jsFiles(build.client.outDir),
        ),
      ).toEqual(expected(bundler, mode))
    },
    timeout,
  )
})
