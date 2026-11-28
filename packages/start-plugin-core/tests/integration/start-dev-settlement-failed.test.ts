/**
 * A module whose newest answer fails, on Start's Vite dev server: what the
 * server keeps of the module is what its last good answer left (a compile
 * error commits nothing), or the judged record of an answer import
 * protection fails (its imports hold: what one of them allows stays
 * allowed). A failed derived output (a split chunk) leaves its env
 * module's server functions as they are.
 *
 * Settlement design, step 2 (`session.transform`'s commit; design §2's
 * table, amended after the step's reviews).
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import type { ImportProtectionOptions } from '../importProtection/public-types'

const name = (file: string) => path.basename(file.split('?')[0]!)

/** Import protection recording `onViolation` (`reports`), with `allowImport` answering `allow`. */
function protection(
  behavior: 'mock' | 'error',
  allow: (info: { importer: string; specifier: string }) => boolean,
) {
  const reports: Array<string> = []
  const importProtection: ImportProtectionOptions = {
    behavior,
    onViolation: (info) => {
      reports.push(`${name(info.importer)} -> ${info.specifier}`)
    },
    allowImport: (info) => allow(info),
  }
  return { importProtection, reports }
}

const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`
/** Whether served code is the marked file (`real`) or its mock. */
const served = (code: string) =>
  code.includes('MARK_SECRET') ? 'real' : 'mock'

describe('Vite dev: a failed answer', () => {
  // `form.ts`'s import of the marked `lib.ts` is allowed, so `lib.ts` is
  // served as it is; `form.ts` is saved with a syntax error, and fixed.
  // Through the failure `lib.ts` stays as it was served, and nothing is
  // reported.
  // Source: Fable's review of settlement step 2, finding 1
  // (`zz-probe-failed-retire.test.ts`, client).
  test('a compile error of an importer: the file its allowed import made real stays real, unreported', async () => {
    const { importProtection, reports } = protection('mock', (info) =>
      info.importer.endsWith('form.ts'),
    )
    const good = `import { secret } from './lib'\nexport const read = () => secret()\n`
    const server = await startDevServer({
      start: { importProtection },
      files: { 'src/lib.ts': marked, 'src/form.ts': good },
    })
    await server.transform('/src/form.ts')
    expect(served(await server.transform('/src/lib.ts'))).toBe('real')
    await server.edit({
      'src/form.ts': `import { secret } from './lib'\nexport const read = () => secret(\n`,
    })
    await expect(server.transform('/src/form.ts')).rejects.toThrow()
    expect(served(await server.transform('/src/lib.ts'))).toBe('real')
    await server.edit({ 'src/form.ts': `// fixed\n${good}` })
    await server.transform('/src/form.ts')
    expect(served(await server.transform('/src/lib.ts'))).toBe('real')
    await server.idle()
    expect(reports).toEqual([])
  })

  // `form.ts` imports the marked `lib.ts`, which `allowImport` allows, and
  // the denied `other.server.ts`, which it does not: under `behavior:
  // 'error'` `form.ts` fails, once, for `other.server.ts`; its allowed
  // import still makes `lib.ts` real.
  // Source: Fable's review of settlement step 2, finding 1
  // (`zz-probe-ip-error-retire.test.ts`).
  test('an importer import protection fails: its allowed import still makes the file real', async () => {
    const { importProtection, reports } = protection(
      'error',
      (info) => info.importer.endsWith('form.ts') && info.specifier === './lib',
    )
    const server = await startDevServer({
      start: { importProtection },
      files: {
        'src/lib.ts': marked,
        'src/other.server.ts': `export const other = 1\n`,
        'src/form.ts': `import { secret } from './lib'
import { other } from './other.server'
export const read = () => [secret(), other]
`,
      },
    })
    await expect(server.transform('/src/form.ts')).rejects.toThrow()
    await server.idle()
    expect(
      await server.transform('/src/lib.ts').then(served, () => 'failed'),
    ).toBe('real')
    await server.idle()
    expect(reports).toEqual(['form.ts -> ./other.server'])
  })

  // A route whose split component reads a denied file (`behavior:
  // 'error'`): the page loads the route and preloads its component, whose
  // chunk fails, and then calls the route's server fn. The env module the client compiled
  // references it: no warning that no client module does.
  // Source: Gemini's review of settlement step 2, required fix 1.
  test("a failed split chunk: its route's server fn stays referenced by the client", async () => {
    const { importProtection } = protection('error', () => false)
    const server = await startBrowserStartDevServer({
      start: { importProtection },
      files: {
        ...startRequestFiles,
        'src/secret.server.ts': `export const secret = 'MARK_SECRET'\n`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { secret } from '../secret.server'
export const loadData = createServerFn().handler(() => 'MARK_DATA')
export const Route = createFileRoute('/')({
  loader: () => loadData(),
  component: () => <p>{secret}</p>,
})
`,
        'src/entry.ts': `import { Route, loadData } from './routes/index'
export const preload = async () => {
  try {
    await (Route.options.component as { preload?: () => Promise<unknown> }).preload?.()
    return 'loaded'
  } catch {
    return 'failed'
  }
}
export { loadData }
`,
      },
    })
    const { result } = await runViteClient(
      server,
      '/src/entry.ts',
      'return [await entry.preload(), entry.loadData.url]',
    )
    // (the page cannot tell: a lazy component's preload answers a failed
    // chunk with a reload; the server reported the denial)
    if (
      findDiagnostics(server.diagnostics, { severity: 'error' }).length === 0
    ) {
      throw new Error('test: the component chunk did not fail')
    }
    const [, url] = result as [string, string]
    expect(await callServerFn(server, url)).toBe('MARK_DATA')
    await server.idle()
    expectNoDiagnostic(server.diagnostics, {
      severity: 'warning',
      file: 'src/routes/index.tsx',
      root: server.root,
    })
  })
})
