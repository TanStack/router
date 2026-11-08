/**
 * An app module importing a package the client cannot resolve, in real
 * Start builds (Vite and Rsbuild): import protection reads the import as one
 * it couldn't resolve (no file rule judges it, a specifier rule does), and
 * the bundler decides on it. What the client keeps only as a type is erased
 * and the client build has none of the package; an import the client keeps
 * (whole, or through `verbatimModuleSyntax`) fails the build in the
 * bundler's own resolution (SPEC J6.1). The cases: node-only-imports-cases.ts.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import {
  deniedPackage,
  keptWhole,
  nodeOnlyMark,
  nodeOnlyPackage,
  typeRemainder,
  valueRemainder,
} from './node-only-imports-cases'
import { importersIn } from './v2-hosts'
import type { Plugin } from 'vite'
import type { StartBuildError, StartBundler } from '../../build-harness'

const timeout = 60_000

/**
 * `verbatimModuleSyntax` as each bundler's TypeScript transform reads it:
 * Vite from `tsconfig.json`, Rsbuild from its SWC options (it does not read
 * the option from `tsconfig.json`).
 */
const verbatim: Record<
  StartBundler,
  Pick<Parameters<typeof buildStart>[0], 'files' | 'rsbuildConfig'>
> = {
  vite: {
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true },
      }),
    },
  },
  rsbuild: {
    files: {},
    rsbuildConfig: {
      tools: { swc: { jsc: { transform: { verbatimModuleSyntax: true } } } },
    },
  },
}

/**
 * The build failed in the bundler's resolution of the import: no violation,
 * and not in a resolution of Start's compile (`this.resolve` of a plugin:
 * Rolldown's "Errored while resolving", as node-only-target.test.ts checks).
 */
function expectBundlerFailure(error: StartBuildError) {
  expect({
    violations: error.violations.length,
    failedInCompile: /Errored while resolving/.test(String(error.message)),
  }).toEqual({ violations: 0, failedInCompile: false })
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an import the client keeps only as a type builds, with none of the package in the client',
    async () => {
      const built = await buildStart({
        bundler,
        files: { ...nodeOnlyPackage, 'src/entry.ts': typeRemainder },
        entry: 'src/entry.ts',
      })
      expect({
        packageCode: built.client.where(nodeOnlyMark),
        show: (await built.client.run('return typeof entry.show')).result,
        violations: built.violations.length,
      }).toEqual({ packageCode: 'nowhere', show: 'function', violations: 0 })
    },
    timeout,
  )

  test(
    'with verbatimModuleSyntax the import stays, and the build fails in the bundler',
    async () => {
      const { files, ...config } = verbatim[bundler]
      expectBundlerFailure(
        await rejection(
          buildStart({
            bundler,
            files: {
              ...nodeOnlyPackage,
              ...files,
              'src/entry.ts': typeRemainder,
            },
            entry: 'src/entry.ts',
            ...config,
          }),
        ),
      )
    },
    timeout,
  )

  test(
    'an import the client keeps whole fails the build in the bundler',
    async () => {
      expectBundlerFailure(
        await rejection(
          buildStart({
            bundler,
            files: { ...nodeOnlyPackage, 'src/entry.ts': keptWhole },
            entry: 'src/entry.ts',
          }),
        ),
      )
    },
    timeout,
  )

  test(
    'a specifier rule denying the package judges the kept import: mock mode serves the mock and reports the importer',
    async () => {
      const built = await buildStart({
        bundler,
        files: { ...nodeOnlyPackage, 'src/entry.ts': valueRemainder },
        entry: 'src/entry.ts',
        start: { importProtection: { ...deniedPackage, behavior: 'mock' } },
      })
      const { result } = await built.client.run(
        `${describeValuePrelude}return describeValue(entry.show(), ${JSON.stringify(nodeOnlyMark)})`,
      )
      expect({
        packageCode: built.client.where(nodeOnlyMark),
        show: result,
        reported: importersIn(built, 'client'),
      }).toEqual({
        packageCode: 'nowhere',
        show: 'a safe mock',
        reported: ['src/entry.ts'],
      })
    },
    timeout,
  )

  test(
    'a specifier rule denying the package judges the kept import: error mode fails the build, naming the importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: { ...nodeOnlyPackage, 'src/entry.ts': valueRemainder },
          entry: 'src/entry.ts',
          start: { importProtection: { ...deniedPackage, behavior: 'error' } },
        }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/entry.ts'])
    },
    timeout,
  )
})

/**
 * An app's resolver plugin that throws when the client first asks it for
 * `#secret` (the compile's resolution of the import), then resolves it to
 * the denied `src/secret.server.ts` (the bundler's own resolution).
 */
function throwsOnceForSecret(): Plugin {
  let root = ''
  let thrown = false
  return {
    name: 'app:throws-once-for-secret',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    resolveId(source) {
      if (source !== '#secret' || this.environment.name !== 'client') {
        return null
      }
      if (!thrown) {
        thrown = true
        throw new Error('the resolver failed')
      }
      return path.join(root, 'src/secret.server.ts')
    },
  }
}

describe('vite build', () => {
  test(
    'a denied file behind an import the compile could not resolve is still denied when the bundler loads it',
    async () => {
      const error = await rejection(
        buildStart({
          files: {
            'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
            'src/entry.ts': `import { secret } from '#secret'
export const read = () => secret()
`,
          },
          entry: 'src/entry.ts',
          viteConfig: { plugins: [throwsOnceForSecret()] },
          start: { importProtection: { behavior: 'error' } },
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )
})
