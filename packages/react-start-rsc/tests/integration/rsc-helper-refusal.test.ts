/**
 * An RSC render outside a server fn (SPEC J4.12, G5): an exported helper of
 * a module the client loads (`renderServerComponent(<Part />)` in an arrow
 * function), whose module the client compiles, is refused at the call on
 * the dev server of Vite and of Rsbuild. The fix its message gives, the
 * helper wrapped in `createServerOnlyFn(…)` that only server code calls,
 * builds for production on both bundlers and renders the server component
 * on the page. A server fn in a module another plugin compiles from a file
 * that is no JavaScript (`.mdx`) is refused at its chain: with RSC the
 * provider is a module derived from the file, which such a module cannot
 * have.
 */
import { expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { errorsOf, waitForHydration } from './rsc-app'
import {
  openRscPage,
  startRscDevServer,
  startRscPreviewServer,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
} from './rsc-serial'

/**
 * From the dev server's start to the refusal: on Vite, the server renders
 * the page first, and the client compiles `src/part.tsx` only once the page
 * hydrates and imports the route; under load that takes seconds.
 */
const refusalTimeout = 30_000

const partModule = (
  helper: string,
) => `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
function Part() {
  return <b data-testid="part">MARK_PART_RENDERED</b>
}
${helper}
export const getPart = createServerFn().handler(async () => renderPart())
`

const refused = partModule(
  `export const renderPart = () => renderServerComponent(<Part />)`,
)
const fixed = partModule(
  `export const renderPart = createServerOnlyFn(() => renderServerComponent(<Part />))`,
)

const files = (part: string) => ({
  'src/part.tsx': part,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getPart } from '../part'
export const Route = createFileRoute('/')({
  loader: () => getPart(),
  component: () => <main>{Route.useLoaderData()}</main>,
})
`,
})

for (const bundler of ['vite', 'rsbuild'] as const) {
  test(`${bundler} dev: the render in an exported helper is refused at the call`, async () => {
    const server = await (
      bundler === 'vite' ? startRscDevServer : startRscRsbuildDevServer
    )({ files: files(refused), browser: true })
    const page = await openRscPage(server, '/')
    const where = {
      severity: 'error',
      file: 'src/part.tsx',
      root: server.root,
    } as const
    // (no `problems`: on Rsbuild the page's errors hold the refused
    // module's failed build, the outcome itself)
    await waitForOutcome({
      applied: () => findDiagnostics(server.diagnostics, where).length > 0,
      timeout: refusalTimeout,
      describe: async () =>
        `the server reported ${JSON.stringify(
          server.diagnostics.map(({ severity, text }) => ({
            severity,
            text: text.slice(0, 200),
          })),
        )}; the page shows ${JSON.stringify(
          await page
            .locator('body')
            .textContent()
            .catch(() => '(loading)'),
        )}, its errors: ${JSON.stringify(errorsOf(page))}`,
    })
    expectDiagnostic(server.diagnostics, {
      ...where,
      position: diagnosticPosition(refused, 'renderServerComponent(<Part'),
    })
  })

  test(`${bundler} build: the helper wrapped in createServerOnlyFn renders the server component`, async () => {
    const server = await (
      bundler === 'vite' ? startRscPreviewServer : startRscRsbuildPreviewServer
    )({ files: files(fixed) })
    const page = await openRscPage(server, '/')
    await page
      .locator('[data-testid=part]', { hasText: /MARK_PART_RENDERED/ })
      .waitFor()
    await waitForHydration(page)
    expect(errorsOf(page)).toEqual([])
  })
}

/** An app plugin compiling `.mdx` pages to JavaScript before Start (as `@mdx-js/rollup` does). */
const mdxLike = {
  name: 'app:mdx-like',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    return id.endsWith('.mdx') ? code.replace(/^# .*$/m, '') : undefined
  },
}

test('vite dev: a server fn of a module compiled from an .mdx file is refused at its chain', async () => {
  const page = `# A page

import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_MDX')
`
  const server = await startRscDevServer({
    config: { plugins: [mdxLike] },
    files: {
      'src/page.mdx': page,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fn } from '../page.mdx'
export const Route = createFileRoute('/')({
  component: () => <button onClick={() => fn()}>call</button>,
})
`,
    },
  })
  const mark = server.diagnostics.length
  const thrown = await server.transform('/src/page.mdx', 'client').then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(thrown, 'the client serves the module').toBeDefined()
  expectDiagnostic([thrown, ...server.diagnostics.slice(mark)], {
    severity: 'error',
    file: 'src/page.mdx',
    root: server.root,
    position: diagnosticPosition(page, 'createServerFn()'),
  })
})
