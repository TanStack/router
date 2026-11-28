/**
 * A production build of a React Start app with RSC enabled whose route
 * renders a label of a module that also exports a server fn nothing calls,
 * whose handler imports a package with a `development` export only (SPEC
 * J4.2: the server bundle provides the functions server code declares and
 * the client's emitted code calls). The label renders in the browser only
 * (`<ClientOnly>`), so no server compile holds the module: only the client
 * compile stubs the function, and the bundler drops the stub. The build
 * succeeds and its output holds no copy of the handler, on Vite and on
 * Rsbuild.
 */
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { describe, expect } from 'vitest'
import { openRscPage, waitForHydration } from './rsc-app'
import { test } from './test'
import type { RscPreviewServer } from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'

const files = {
  'node_modules/dev-only-label/package.json': JSON.stringify({
    name: 'dev-only-label',
    type: 'module',
    exports: {
      '.': { types: './index.d.ts', development: './index.js' },
    },
  }),
  'node_modules/dev-only-label/index.js': `export const label = 'MARK_DEV_LABEL'\n`,
  'node_modules/dev-only-label/index.d.ts': `export declare const label: string\n`,
  'src/label/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { label } from 'dev-only-label'
export const ordinaryLabel = 'MARK_ORDINARY_LABEL'
export const neverCalled = createServerFn().handler(() => 'MARK_UNUSED_HANDLER ' + label)
`,
  'src/routes/label.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { ordinaryLabel } from '../label/fns'
export const Route = createFileRoute('/label')({
  component: () => (
    <ClientOnly>
      <span data-testid="label">{ordinaryLabel}</span>
    </ClientOnly>
  ),
})
`,
}

/** The page shows the label, and no built file holds the unused handler. */
async function expectLabelOnly(page: Page, server: RscPreviewServer) {
  await openRscPage(page, server, '/label')
  await waitForHydration(page)
  await page
    .locator('[data-testid=label]', { hasText: 'MARK_ORDINARY_LABEL' })
    .waitFor()
  const dist = path.join(server.root, 'dist')
  const entries = await readdir(dist, { recursive: true, withFileTypes: true })
  const holding: Array<string> = []
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name)
    if (
      entry.isFile() &&
      (await readFile(file, 'utf8')).includes('MARK_UNUSED_HANDLER')
    ) {
      holding.push(path.relative(dist, file))
    }
  }
  expect(holding).toEqual([])
}

describe('a server fn nothing calls, beside a label the browser renders', () => {
  test('Vite: the build serves the label and holds no copy of the handler', async ({
    startRscPreviewServer,
    page,
  }) => {
    await expectLabelOnly(page, await startRscPreviewServer({ files }))
  })

  // c640edebf2: the server compilation's last settlement run listed every
  // function a client compile stubbed and built its provider, whose
  // package export the production conditions do not match (main and
  // db260cf3a3 built it)
  test('Rsbuild: the build serves the label and holds no copy of the handler', async ({
    startRscRsbuildPreviewServer,
    page,
  }) => {
    const server = await startRscRsbuildPreviewServer({ files })
    expect(server.errors).toEqual([])
    await expectLabelOnly(page, server)
  })
})
