/**
 * A package's `'use client'` widget that only a server component renders,
 * using a server-only-marked module of its package, on Rsbuild with RSC
 * (rsc-use-client-app.ts, `packageWidgetApp`). Rspack's RSC client
 * references are the widget's only importer: the widget is in the app
 * through them, as an entry's module is, so its import of the marked
 * module is judged like any import the app reaches: `allowImport` and an
 * exemption give the real module, a mock is reported at the widget (also
 * next to another importer of the same mock), in builds and in dev.
 * Source: the reviews of the node_modules policy implementation (Gemini
 * F1 `case6a`, `rsbuild-rsc-dev`; Astra 3 `head-rsbuild-rsc-mixed`).
 */
import { describe, expect, test } from 'vitest'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import {
  packageWidgetApp,
  packageWidgetMixedApp,
  summary,
} from './rsc-use-client-app'
import {
  openRscPage,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
} from './rsc-serial'
import type { Violation } from './rsc-use-client-app'

/** Start's import protection with `options` and a recorder of `onViolation`. */
function protection(options: Record<string, unknown>) {
  const violations: Array<Violation> = []
  return {
    violations,
    start: {
      importProtection: {
        ...options,
        onViolation: (info: Violation) => {
          violations.push(info)
        },
      },
    },
  }
}

describe('Rsbuild build with RSC', () => {
  test.for<[string, Record<string, unknown>]>([
    [
      'allowImport on the marked file',
      {
        allowImport: ({ resolved }: { resolved?: string }) =>
          resolved?.endsWith('/audit-lib/secret.js') === true,
      },
    ],
    [
      'ignoreImporters on the widget',
      { ignoreImporters: ['**/audit-lib/widget.jsx'] },
    ],
  ])(
    '%s gives the widget the real module, nothing reported',
    async ([_, options]) => {
      const { violations, start } = protection({
        behavior: 'error',
        ...options,
      })
      const server = await startRscRsbuildPreviewServer({
        start,
        files: packageWidgetApp,
      })
      const page = await openRscPage(server, '/c')
      await page
        .locator('[data-testid=widget]', { hasText: /MARK_SECRET/ })
        .waitFor()
      expect(summary(violations)).toEqual([])
    },
  )

  test('mock: the widget and a route component reading the mock through a package barrel are both reported', async () => {
    const { violations, start } = protection({
      behavior: 'mock',
      mockAccess: 'off',
    })
    await startRscRsbuildPreviewServer({
      start,
      files: packageWidgetMixedApp,
    })
    expect(summary(violations)).toEqual([
      'client marker title.js -> ./secret.js',
      'client marker widget.jsx -> ./secret.js',
    ])
  })
})

// An exempt app module needs the marked file as it is, and the widget, a
// checked importer the compiler does not compile, reaches it too: the
// build fails (R147), naming the widget at its import of the file.
// Source: reviews of the node_modules policy implementation (Gemini F6.2,
// case 6b: the widget was named as an import another plugin added).
describe('Rsbuild build with RSC, importers that disagree', () => {
  test('the conflict names the widget at its import of the marked file', async () => {
    const { start } = protection({
      behavior: 'error',
      exclude: ['src/admin.ts'],
    })
    const built = await startRscRsbuildPreviewServer({
      start,
      files: {
        ...packageWidgetApp,
        'node_modules/audit-lib/package.json': JSON.stringify({
          name: 'audit-lib',
          version: '1.0.0',
          type: 'module',
          peerDependencies: { '@tanstack/react-start': '*' },
          exports: { './widget': './widget.jsx', './secret': './secret.js' },
        }),
        'src/admin.ts': `import { secret } from 'audit-lib/secret'\nexport const admin = () => secret()\n`,
        'src/routes/c.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { admin } from '../admin'
import { getC } from '../c/page'
export const Route = createFileRoute('/c')({
  loader: async () => ({ tree: await getC() }),
  component: Page,
})
function Page() {
  return <main data-testid="main">{String(admin())}{Route.useLoaderData().tree}</main>
}
`,
      },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(built).toBeInstanceOf(AggregateError)
    const text = (built as AggregateError).errors.map(String).join('\n')
    const { line, column } = diagnosticPosition(
      packageWidgetApp['node_modules/audit-lib/widget.jsx'],
      "'./secret.js'",
    )
    expect(text).toContain(
      `node_modules/audit-lib/widget.jsx:${line}:${column}`,
    )
  })
})

describe('Rsbuild dev with RSC', () => {
  test('the widget is served the mock, and the marked file is reported', async () => {
    const { violations, start } = protection({ mockAccess: 'off' })
    const server = await startRscRsbuildDevServer({
      browser: true,
      start,
      files: packageWidgetApp,
    })
    const page = await openRscPage(server, '/c')
    await page
      .locator('[data-testid=root]', { hasText: /SERVER_ROOT/ })
      .waitFor()
    // (a dev server names the denied file of an importer it does not
    // compile: it serves the file before it knows who imports it)
    expect(summary(violations)).toEqual([
      'client marker secret.js -> node_modules/audit-lib/secret.js',
    ])
  })
})
