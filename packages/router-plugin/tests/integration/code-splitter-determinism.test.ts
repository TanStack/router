/**
 * Code splitting does not depend on where the project lives or on how the
 * platform spells paths: the same route compiles to the same modules under
 * any project root and with Windows module ids, and building the same app
 * twice, in two directories, emits the same files.
 */
import { expect, test, vi } from 'vitest'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
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
  'building the same app twice in two directories emits the same files (%s)',
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
