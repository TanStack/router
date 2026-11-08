/**
 * An RSC render outside a server fn (SPEC J4.12, G5): an exported helper of
 * a module the client loads (`renderServerComponent(<Part />)` in an arrow
 * function), whose module the client compiles, is refused at the call on
 * the dev server of Vite and of Rsbuild. The fix its message gives, the
 * helper wrapped in `createServerOnlyFn(…)` that only server code calls,
 * builds for production on both bundlers and renders the server component
 * on the page.
 */
import { expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  openRscPage,
  startRscDevServer,
  startRscPreviewServer,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

const timeout = 120_000

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
  test(
    `${bundler} dev: the render in an exported helper is refused at the call`,
    async () => {
      const server = await (
        bundler === 'vite' ? startRscDevServer : startRscRsbuildDevServer
      )({ files: files(refused), browser: true })
      await openRscPage(server, '/')
      await expect
        .poll(() => server.diagnostics.some((d) => d.severity === 'error'))
        .toBe(true)
      expectDiagnostic(server.diagnostics, {
        severity: 'error',
        file: 'src/part.tsx',
        root: server.root,
        position: diagnosticPosition(refused, 'renderServerComponent(<Part'),
      })
    },
    timeout,
  )

  test(
    `${bundler} build: the helper wrapped in createServerOnlyFn renders the server component`,
    async () => {
      const server = await (
        bundler === 'vite'
          ? startRscPreviewServer
          : startRscRsbuildPreviewServer
      )({ files: files(fixed) })
      const page = await openRscPage(server, '/')
      await page.waitForText('MARK_PART_RENDERED', {
        selector: '[data-testid=part]',
      })
      await waitForHydration(page)
      expect(page.errors).toEqual([])
    },
    timeout,
  )
}
