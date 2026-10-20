/**
 * Not part of the compiler test corpus (implementation control: SPEC G4
 * frees emitted files and bytes across project roots; the corpus checks
 * relocation by what the built app does,
 * `../code-splitter-determinism.test.ts`).
 *
 * With the current code splitter, building the same app twice, in two
 * directories, emits the same files. A rewrite may legitimately fail this.
 */
import { expect, test, vi } from 'vitest'
import { build, routeApp } from '../../build-harness'
import { head } from '../../regression-helpers'
import type * as NodeUrl from 'node:url'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

// Node's file URL helpers follow the host platform. For Windows paths
// (drive letter first) they behave here as they do on Windows; other paths
// are unaffected.
vi.mock('node:url', async (importOriginal) => {
  const url = await importOriginal<typeof NodeUrl>()
  const windowsPath = /^[A-Za-z]:[\\/]/
  return {
    ...url,
    pathToFileURL: (file: string, options?: { windows?: boolean }) =>
      url.pathToFileURL(file, {
        ...options,
        windows: options?.windows ?? windowsPath.test(file),
      }),
    fileURLToPath: (href: string | URL, options?: { windows?: boolean }) =>
      url.fileURLToPath(href, {
        ...options,
        windows:
          options?.windows ??
          /^\/[A-Za-z]:\//.test(new URL(String(href)).pathname),
      }),
  }
})

const appFiles = routeApp(
  `${head}import { format } from '../format'
function Page() {
  return <p>{format('MARK_PAGE')}</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_DATA',
  errorComponent: Failure,
  component: Page,
})
`,
  {
    env: 'client',
    files: {
      'format.ts': 'export const format = (text: string) => `[${text}]`\n',
    },
  },
)

/** Builds the app in a directory named after `prefix`; returns its files. */
async function buildIn(bundler: Bundler, prefix: string, reverse: boolean) {
  const files = Object.entries(appFiles)
  const app = await build({
    bundler,
    env: 'client',
    prefix,
    // Write the files in another order
    files: Object.fromEntries(reverse ? files.reverse() : files),
  })
  return Object.fromEntries(
    app.chunks
      .map((chunk) => [chunk.fileName, chunk.code] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

test.each(['vite', 'rspack', 'webpack'] as const)(
  'the current code splitter emits the same files for the same app built in two directories (%s)',
  async (bundler) => {
    const first = await buildIn(bundler, '.determinism-a-', false)
    const second = await buildIn(
      bundler,
      '.determinism-another-longer-directory-',
      true,
    )
    expect(Object.keys(first).length).toBeGreaterThan(1)
    expect(second).toEqual(first)
  },
  120_000,
)
