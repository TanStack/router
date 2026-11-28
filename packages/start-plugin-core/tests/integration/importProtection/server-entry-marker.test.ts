/**
 * `@tanstack/<fw>-start/server` is a server-only-marked module (node_modules
 * policy, decision 12): the marker denies it to every client importer that
 * is not exempt, a package's module included, not only to the app's files
 * the built-in specifier rule checks. Real Start builds, Vite and Rsbuild;
 * React, Solid and Vue (the framework packages' emitted entries carry the
 * marker import).
 *
 * A package's use the client keeps fails the build at the package's
 * import; a use the compiler erases (`createIsomorphicFn().server()`, a
 * server fn's handler), an export the client does not use, and a type-only
 * import build, with nothing of Start's server runtime in the client.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest, installPackage } from '../../package-layouts'
import { solidAppConfig } from '../hydrate-pages'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import type { StartBundler } from '../../build-harness'
import type { TestPackage } from '../../package-layouts'

const timeout = 60_000

type Framework = 'react' | 'solid' | 'vue'
const frameworks: ReadonlyArray<Framework> = ['react', 'solid', 'vue']

/** Start's server runtime in the client: its request storage (`node:async_hooks`). */
const SERVER_RUNTIME = 'AsyncLocalStorage'

/** `req-lib`, declaring Start, with `files` importing the server entry of `framework`. */
const reqLib = (
  framework: Framework,
  files: (entry: string) => Record<string, string>,
): TestPackage => ({
  name: 'req-lib',
  manifest: { peerDependencies: { [`@tanstack/${framework}-start`]: '*' } },
  files: files(`@tanstack/${framework}-start`),
})

/** Builds an app whose client entry is `entry`, with `pkg` installed. */
function buildWith(
  bundler: StartBundler,
  framework: Framework,
  pkg: TestPackage,
  entry: string,
  start?: Parameters<typeof buildStart>[0]['start'],
) {
  const lib = installPackage('npm', pkg)
  return buildStart({
    bundler,
    framework,
    files: { ...lib.files, 'src/entry.ts': entry },
    packageJson: appManifest([lib], {
      dependencies: {
        [`@tanstack/${framework}-start`]: '*',
        ...lib.dependency,
      },
    }),
    entry: 'src/entry.ts',
    start,
    // (Solid's JSX compiler for the harness's own route files)
    ...(framework === 'solid' && solidAppConfig),
  })
}

describe.each(startBundlers)('%s build', (bundler: StartBundler) => {
  // On main, Vite builds with Start's server runtime in the client (the
  // page fails when it loads it) and Rsbuild fails on `node:async_hooks`.
  // Source: node_modules policy, decision 12 (B); its study's first row.
  test.each(frameworks)(
    '%s: a package module whose client use of the server entry is kept fails the build at its import',
    async (framework) => {
      const pkg = reqLib(framework, (start) => ({
        'index.js': `import { getRequestHeaders } from '${start}/server'\nexport const host = () => getRequestHeaders().get('host')\n`,
      }))
      const error = await rejection(
        buildWith(
          bundler,
          framework,
          pkg,
          `import { host } from 'req-lib'\nexport const read = () => host()\n`,
        ),
      )
      const reported = reportedViolations(error)
      expect(reported).not.toEqual([])
      for (const { environment, importer } of reported) {
        expect(environment).toBe('client')
        expect(importer).toMatch(/^node_modules\/req-lib\/index\.js:1:/)
      }
    },
    timeout,
  )

  // Source: node_modules policy, decision 12 (B); the reviews' `@shop-on/i18n`
  // shape (a request read inside `createIsomorphicFn().server()`).
  test.each(frameworks)(
    '%s: a package module reading the request in createIsomorphicFn().server() builds; the client runs its client side',
    async (framework) => {
      const pkg = reqLib(framework, (start) => ({
        'index.js': `import { createIsomorphicFn } from '${start}'
import { getRequestHeaders } from '${start}/server'
export const host = createIsomorphicFn()
  .server(() => getRequestHeaders().get('host'))
  .client(() => 'MARK_CLIENT_HOST')
`,
      }))
      const build = await buildWith(
        bundler,
        framework,
        pkg,
        `import { host } from 'req-lib'\nexport const read = () => host()\n`,
      )
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_CLIENT_HOST')
      expect(build.client.where(SERVER_RUNTIME)).toBe('nowhere')
      expect(reportedViolations(build)).toEqual([])
    },
    timeout,
  )

  // On main, Rsbuild fails on `node:async_hooks` for an import the client
  // drops; Vite builds with four warnings.
  // Source: node_modules policy, decision 12 (B); its study's second row.
  test(
    'react: a package barrel whose unused export uses the server entry builds, with no warning',
    async () => {
      const pkg = reqLib('react', (start) => ({
        'index.js': `export { host } from './host.js'\nexport const SAFE = 'MARK_SAFE'\n`,
        'host.js': `import { getRequestHeaders } from '${start}/server'\nexport const host = () => getRequestHeaders().get('host')\n`,
      }))
      const build = await buildWith(
        bundler,
        'react',
        pkg,
        `import { SAFE } from 'req-lib'\nexport const read = () => SAFE\n`,
      )
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_SAFE')
      expect(build.client.where(SERVER_RUNTIME)).toBe('nowhere')
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  // `@tanstack/react-form-start`'s shape: the entry read inside a server fn's
  // handler, which the client compile erases.
  // Source: node_modules policy, decision 12 (B); the study's section 4.2.
  test(
    'react: a package server fn whose handler reads the request builds, with nothing of the server runtime in the client',
    async () => {
      const pkg = reqLib('react', (start) => ({
        'index.js': `import { createServerFn } from '${start}'
import { getRequestHeaders } from '${start}/server'
export const hostFn = createServerFn().handler(async () => getRequestHeaders().get('host'))
`,
      }))
      const build = await buildWith(
        bundler,
        'react',
        pkg,
        `import { hostFn } from 'req-lib'\nexport const read = () => typeof hostFn\n`,
      )
      expect(build.client.where(SERVER_RUNTIME)).toBe('nowhere')
      expect(reportedViolations(build)).toEqual([])
    },
    timeout,
  )

  // A workspace file outside the app's source directory may import the
  // entry's types.
  // Source: node_modules policy, decision 12 (B); the study's table.
  test(
    'react: a workspace module importing only types of the server entry builds',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'shared/handler.ts': `import type { RequestHandler } from '@tanstack/react-start/server'
export const describe = (h: RequestHandler<any> | null) => (h === null ? 'MARK_NONE' : 'set')
`,
          'src/entry.ts': `import { describe } from '../shared/handler'\nexport const read = () => describe(null)\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_NONE')
      expect(reportedViolations(build)).toEqual([])
    },
    timeout,
  )
})
