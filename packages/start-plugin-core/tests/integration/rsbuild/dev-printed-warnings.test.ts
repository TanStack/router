/**
 * What Start's Rsbuild dev server prints (SPEC G5, §5.7): Rsbuild prints the
 * last compilation of each environment once every environment is done
 * (`onDevCompileDone`), so a warning raised in a compilation that a newer
 * one replaced before that is printed with the newer one. On a cold start
 * without `routeTree.gen.ts`, the generator writes it while the client
 * compiles, and the client compiles again: the import-protection warning of
 * a mocked import and the compiler's warnings of that first compile are
 * printed all the same, once in a report. (Rsbuild prints again an
 * environment's last compilation when another environment compiles again
 * after it: the client's report is printed again when the server compiles a
 * second time, as for any warning.) An edit after that prints them in no
 * report more than once.
 */
import { expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin } from '@rsbuild/core'

/** The warnings of every report Rsbuild prints (`onDevCompileDone`). */
function recordPrinted(): {
  plugin: RsbuildPlugin
  printed: Array<Array<Diagnostic>>
} {
  const printed: Array<Array<Diagnostic>> = []
  return {
    printed,
    plugin: {
      name: 'test:printed-warnings',
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
      },
    },
  }
}

const serverParam = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`

test('a cold start without the route tree prints the warnings of the first client compile, once in a report', async () => {
  const { plugin, printed } = recordPrinted()
  const server = await startRsbuildStartDevServer({
    start: { importProtection: { behavior: { dev: 'mock' } } },
    config: { plugins: [plugin] },
    files: {
      'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
import { requireRole } from '../role'
export const Route = createFileRoute('/')({
  component: () => <p>{String(secret)}{String(requireRole)}</p>,
})
`,
      'src/secret.server.ts': `export const secret = 'MARK_SECRET'\n`,
      'src/role.ts': serverParam,
      'src/entry.ts': `import './router'\n`,
    },
  })
  await server.settle()
  // what Rsbuild printed last: every environment's last compilation
  const last = printed.at(-1) ?? []
  // the mocked import, reported at the importer
  expectDiagnostic(last, {
    severity: 'warning',
    file: 'src/routes/index.tsx',
    root: server.root,
    times: 1,
  })
  // the compiler's warning of the client compile
  expectDiagnostic(last, {
    severity: 'warning',
    file: 'src/role.ts',
    root: server.root,
    times: 1,
  })

  // an edit of another module: what was printed is not printed twice
  const before = printed.length
  await server.edit({ 'src/entry.ts': `import './router'\n// edited\n` })
  await server.settle()
  for (const report of printed.slice(before)) {
    for (const file of ['src/routes/index.tsx', 'src/role.ts']) {
      expect(
        findDiagnostics(report, {
          severity: 'warning',
          file,
          root: server.root,
        }).length,
      ).toBeLessThanOrEqual(1)
    }
  }
})

// A dev server restarted on Rspack's persistent cache restores the module
// without compiling it: its first report prints the warning the module's
// latest compile found, as a production build on the cache does.
// Source: round-3 re-checks of the node_modules policy implementation
// (Astra 4 `dev-simple`, Fable N2).
test('a dev server restarted on the persistent cache prints the warnings of the modules it restored', async () => {
  const { plugin, printed } = recordPrinted()
  const first = await startRsbuildStartDevServer({
    config: { plugins: [plugin], performance: { buildCache: true } },
    files: {
      'src/role.ts': serverParam,
      'src/entry.ts': `import { requireRole } from './role'\nexport const role = requireRole\n`,
    },
  })
  await first.settle()
  const role = (report: Array<Diagnostic>) =>
    findDiagnostics(report, {
      severity: 'warning',
      file: 'src/role.ts',
      root: first.root,
    }).length
  expect(role(printed.at(-1) ?? [])).toBe(1)
  await first.stop()
  const before = printed.length
  const server = await first.restart()
  await server.settle()
  expect(printed.length).toBeGreaterThan(before)
  expect(role(printed.at(-1) ?? [])).toBe(1)
})
