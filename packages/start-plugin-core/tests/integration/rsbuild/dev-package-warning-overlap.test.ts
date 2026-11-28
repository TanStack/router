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

function defer() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** `promise`, or a rejection naming `what` after 30 s. */
async function within(promise: Promise<void>, what: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out waiting until ${what}`)),
          30_000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

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

  /**
   * What the held server compilation's save does, and the warnings of each
   * report printed after the first save. The server's first compilation
   * after the save starts once the client's has ended (the client seals
   * first; `clientUses`: the client imports the shared module), and is held in a late asset hook; it writes `during` there and,
   * when that save is the client's too (`clientRebuilds`), stays held until a
   * client compilation that started after it ended. Also gives the warnings
   * of the client's compilation of the save (`replaced` when the server's
   * save replaces it), which seals first.
   */
  async function overlap(
    during: Record<string, string>,
    { clientUses = true, clientRebuilds = true } = {},
  ): Promise<{ reports: Array<number>; clientFirst: number }> {
    const printed: Array<Array<Diagnostic>> = []
    /** The warnings of the client's first compilation after the save. */
    let clientFirst: Array<Diagnostic> | undefined
    const held = { armed: false, first: true, root: '' }
    /** Resolved by the client's next compilation end. */
    let clientDone = defer()
    /** Resolved once the held server compilation is released. */
    const released = defer()
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
          if (environment.name === 'client') {
            config.plugins.push({
              apply(compiler: Rspack.Compiler) {
                compiler.hooks.done.tap('test:overlap', (stats) => {
                  if (held.armed && clientFirst === undefined) {
                    clientFirst = diagnosticsOf(
                      stats.toJson({ all: false, warnings: true }).warnings ??
                        [],
                      'warning',
                    )
                  }
                  clientDone.resolve()
                })
              },
            })
            return
          }
          if (environment.name !== 'ssr') {
            return
          }
          config.plugins.push({
            apply(compiler: Rspack.Compiler) {
              // (the client seals first; a client that does not import the
              // shared module does not compile the save)
              compiler.hooks.make.tapPromise('test:overlap', async () => {
                if (held.armed && held.first && clientUses) {
                  await within(
                    clientDone.promise,
                    'the client compiled the save',
                  )
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
                        clientDone = defer()
                        for (const [file, text] of Object.entries(during)) {
                          fs.writeFileSync(path.join(held.root, file), text)
                        }
                        if (clientRebuilds) {
                          await within(
                            clientDone.promise,
                            'the client compiled the save made while the server was held',
                          )
                        }
                        released.resolve()
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
    clientDone = defer()
    held.armed = true
    await server.write({ 'src/shared.ts': sharedPackage })
    await within(
      released.promise,
      'the server compilation was held and released',
    )
    // (the held compilation, the save it makes, and what follows)
    await server.settle({ accept: () => true })
    const naming = (report: Array<Diagnostic>) =>
      findDiagnostics(report, {
        severity: 'warning',
        file: `${isoLib.directory}/a.js`,
        root: server.root,
      }).length
    return {
      reports: printed.slice(before).map(naming),
      clientFirst: naming(clientFirst ?? []),
    }
  }

  test('the client drops its import while the server is held: the first report has the warning, once', async () => {
    const { reports } = await overlap({ 'src/client-uses.ts': none })
    expect(reports[0]).toBe(1)
    expect(reports.reduce((a, b) => a + b, 0)).toBe(1)
  })

  test('control, only the server imports the package: the first report has the warning, once', async () => {
    const { reports } = await overlap(
      {},
      { clientUses: false, clientRebuilds: false },
    )
    expect(reports[0]).toBe(1)
    expect(reports.reduce((a, b) => a + b, 0)).toBe(1)
  })

  // (the client's compilation of the first save, with the package, carried
  // the warning: so there was one to drop)
  test('control, both drop the package while the server is held: the report of the compilations without it has no warning', async () => {
    const { reports, clientFirst } = await overlap({
      'src/shared.ts': sharedPlain,
    })
    expect(clientFirst).toBe(1)
    expect(reports.at(-1)).toBe(0)
  })
})
