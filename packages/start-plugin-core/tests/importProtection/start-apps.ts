/**
 * Helpers of the import-protection tests that run Start's import protection
 * on a real app: a Vite dev server with Start's import-protection Vite
 * plugin (after the Start compiler, like the Start plugin orders them), a
 * stand-in `react` JSX runtime, and the violations import protection reports
 * to the user (dev server warnings, build errors and warnings), read from the
 * text it prints.
 */
import path from 'node:path'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import { startDevServer } from '../dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { ImportProtectionOptions } from '../../src/schema'
import type { ImportProtectionPluginOptions } from '../../src/vite/import-protection-plugin/types'

/**
 * Starts a Vite dev server (`startDevServer`) on an app of `files` with
 * Start's import protection, configured by `importProtection` (Start's
 * `importProtection` option; source directory `src`).
 */
export function startProtectedDevServer(
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
): Promise<DevServer> {
  return startDevServer({
    files,
    plugins: ({ root }) => [
      importProtectionPlugin({
        getConfig: (() => ({
          startConfig: { importProtection },
          resolvedStartConfig: { srcDirectory: path.join(root, 'src') },
        })) as unknown as ImportProtectionPluginOptions['getConfig'],
        framework: 'react',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
        ],
        providerEnvName: 'ssr',
      }),
    ],
  })
}

/** A stand-in `react` package with the JSX runtime compiled JSX imports. */
export const reactRuntimeFiles: Record<string, string> = {
  'node_modules/react/package.json': JSON.stringify({
    name: 'react',
    type: 'module',
    exports: {
      './jsx-runtime': './jsx-runtime.js',
      './jsx-dev-runtime': './jsx-runtime.js',
    },
  }),
  'node_modules/react/jsx-runtime.js': `export const Fragment = Symbol('Fragment')
export const jsx = (type, props) => (typeof type === 'function' ? type(props) : type)
export const jsxs = jsx
export const jsxDEV = jsx
`,
}

export interface ReportedViolation {
  /** `client` or `server`. */
  environment: string
  /**
   * Where the violation is reported (`Importer:`): the importer relative to
   * the app root, with `:line:column` when the report has a location.
   */
  importer: string
}

/**
 * The import-protection violations reported in `output` (dev server logs,
 * build errors or warnings), in order.
 */
export function reportedViolations(
  output: string | Array<string>,
): Array<ReportedViolation> {
  const text = Array.isArray(output) ? output.join('\n') : output
  return text
    .split('[import-protection] Import denied in ')
    .slice(1)
    .map((report) => ({
      environment: /^(\w+)/.exec(report)![1]!,
      importer: /Importer: (\S+)/.exec(report)?.[1] ?? '',
    }))
}

/** Each distinct value of `values`, in order. */
export function distinct<T>(values: Array<T>): Array<T> {
  return [...new Set(values)]
}

/** `file:line:column` of the first `needle` on 1-based line `line` of `code`. */
export function locationIn(
  file: string,
  code: string,
  line: number,
  needle: string,
): string {
  const column = code.split('\n')[line - 1]!.indexOf(needle)
  if (column === -1) {
    throw new Error(`${needle} is not on line ${line}`)
  }
  return `${file}:${line}:${column + 1}`
}

/** The error a promise rejects with (fails when it resolves). */
export async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the promise to reject')
}
