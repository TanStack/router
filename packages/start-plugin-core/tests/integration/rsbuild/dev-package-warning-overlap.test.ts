/**
 * Start's Rsbuild dev server, the "does not declare Start" warning of a
 * package when the client and server compilations overlap: Rsbuild prints
 * the last compilation of each compiler, so the warning is carried by a
 * compilation that is printed, once per dev session (rule 4 of the Rsbuild
 * host: decided at seal, assigned as compilers finish, committed on print).
 * Source: review-hotspot3-merged-astra.md, finding 3.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { appManifest, installPackage } from '../../package-layouts'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { rsbuildEntries } from '../route-css-cases'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 120_000

/** `iso-lib`, a package that uses Start and does not declare it. */
const isoLib = installPackage('npm', {
  name: 'iso-lib',
  files: {
    'a.js': `import { createIsomorphicFn } from '@tanstack/react-start'
export const tag = createIsomorphicFn().client(() => 'client').server(() => 'server')
`,
  },
})

describe('rsbuild dev: a package warning when the compilations overlap', () => {
  // Finding 3 and its controls. One save makes the client and the server
  // import the package through a shared module. The server's compilation is
  // held in a late asset hook; meanwhile (the first row) a second save
  // removes the client's import, so the client's compilation that claimed
  // the warning is replaced by one without the package. The report Rsbuild
  // prints then is of the new client compilation and of the server's, which
  // still holds the package: its warning is in that report.
  const sharedPlain = `export const tag = () => 'plain'\n`
  const sharedPackage = `export { tag } from 'iso-lib/a.js'\n`
  const uses = `import { tag } from './shared'\nconsole.log(tag)\n`
  const none = `console.log('none')\n`

  /** What the held server compilation's save does, and the warnings of each report printed after the first save. */
  async function overlap(
    during: Record<string, string>,
    clientUses = true,
  ): Promise<Array<number>> {
    const printed: Array<Array<Diagnostic>> = []
    const held = { armed: false, first: true, root: '' }
    const probe: RsbuildPlugin = {
      name: 'test:overlap',
      setup(api) {
        api.onDevCompileDone(({ stats }) => {
          const all = 'stats' in stats ? stats.stats : [stats]
          printed.push(
            all.flatMap((one) =>
              diagnosticsOf(
                one.toJson({ all: false, warnings: true }).warnings ?? [],
                'warning',
              ),
            ),
          )
        })
        api.modifyRspackConfig((config, { environment }) => {
          if (environment.name !== 'ssr') {
            return
          }
          config.plugins.push({
            apply(compiler: Rspack.Compiler) {
              // (the client seals first)
              compiler.hooks.make.tapPromise('test:overlap', async () => {
                if (held.armed && held.first) {
                  await new Promise((resolve) => setTimeout(resolve, 250))
                }
              })
              compiler.hooks.thisCompilation.tap(
                'test:overlap',
                (compilation) => {
                  compilation.hooks.processAssets.tapPromise(
                    { name: 'test:overlap', stage: 5000 },
                    async () => {
                      if (held.armed && held.first) {
                        held.first = false
                        for (const [file, text] of Object.entries(during)) {
                          fs.writeFileSync(path.join(held.root, file), text)
                        }
                        await new Promise((resolve) =>
                          setTimeout(resolve, 1250),
                        )
                      }
                    },
                  )
                },
              )
            },
          })
        })
      },
    }
    const server = await startRsbuildStartDevServer({
      config: { plugins: [probe] },
      packageJson: appManifest([isoLib]),
      files: {
        ...rsbuildEntries,
        ...isoLib.files,
        'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
        'src/shared.ts': sharedPlain,
        'src/client-uses.ts': clientUses ? uses : none,
        'src/server-uses.ts': uses,
        'src/client.tsx': `import './client-uses'\n${rsbuildEntries['src/client.tsx']}`,
        'src/server.ts': `import './server-uses'\n${rsbuildEntries['src/server.ts']}`,
      },
    })
    await server.settle()
    held.root = server.root
    const before = printed.length
    held.armed = true
    await server.write({ 'src/shared.ts': sharedPackage })
    // (the held compilation, the save it makes, and what follows)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await server.settle({ accept: () => true })
    return printed.slice(before).map(
      (report) =>
        findDiagnostics(report, {
          severity: 'warning',
          file: `${isoLib.directory}/a.js`,
          root: server.root,
        }).length,
    )
  }

  test(
    'the client drops its import while the server is held: the first report has the warning, once',
    async () => {
      const reports = await overlap({ 'src/client-uses.ts': none })
      expect(reports[0]).toBe(1)
      expect(reports.reduce((a, b) => a + b, 0)).toBe(1)
    },
    timeout,
  )

  test(
    'control, only the server imports the package: the first report has the warning, once',
    async () => {
      const reports = await overlap({}, false)
      expect(reports[0]).toBe(1)
      expect(reports.reduce((a, b) => a + b, 0)).toBe(1)
    },
    timeout,
  )

  test(
    'control, both drop the package while the server is held: the report of the compilations without it has no warning',
    async () => {
      const reports = await overlap({ 'src/shared.ts': sharedPlain })
      expect(reports.at(-1)).toBe(0)
    },
    timeout,
  )
})
