/**
 * A package that gives the browser and the server different files through
 * export conditions, in a Vite production build with RSC (node_modules
 * policy, decision 13, option A; SPEC J4.2). The RSC environment builds
 * before the client and lists the server functions of the files it
 * resolves; the client calls the function of the file the browser
 * resolves. The supported contract: conditional entries re-export one
 * defining module. Then the build succeeds and the browser's call answers.
 * Two files that each define the function fail the build, naming the
 * browser's file (main built, and the call answered 500).
 */
import { describe, expect } from 'vitest'
import { test } from './test'

const timeout = 60_000

/** `pkg-cond`, `.` exported as `browser.js` to the browser and `server.js` to the rest. */
function conditionalPackage(files: Record<string, string>) {
  return {
    'package.json': JSON.stringify({
      name: 'app',
      private: true,
      type: 'module',
      dependencies: { 'pkg-cond': '1.0.0' },
    }),
    'node_modules/pkg-cond/package.json': JSON.stringify({
      name: 'pkg-cond',
      version: '1.0.0',
      type: 'module',
      exports: { '.': { browser: './browser.js', default: './server.js' } },
      peerDependencies: { '@tanstack/react-start': '*' },
    }),
    ...Object.fromEntries(
      Object.entries(files).map(([file, code]) => [
        `node_modules/pkg-cond/${file}`,
        code,
      ]),
    ),
    // A `'use client'` component a server component renders, calling the
    // package's function; the route's loader calls it too (an installed
    // package's function is listed when a route's loader calls it).
    'src/cond/CondCall.tsx': `'use client'
import { useState } from 'react'
import { pkgPing } from 'pkg-cond'
export function CondCall() {
  const [result, setResult] = useState('')
  return <button data-testid="cond" onClick={() => pkgPing().then(setResult)}>cond {result}</button>
}
`,
    'src/cond/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { CondCall } from './CondCall'
export const getCondPage = createServerFn().handler(() => renderServerComponent(<div>cond <CondCall /></div>))
`,
    'src/routes/cond.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { pkgPing } from 'pkg-cond'
import { getCondPage } from '../cond/page'
export const Route = createFileRoute('/cond')({
  loader: async () => ({ tree: await getCondPage(), ping: await pkgPing() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <main><p data-testid="loader">{data.ping}</p>{data.tree}</main>
}
`,
  }
}

/** The build error's way out for a package that declares Start. */
const conditionalWayOut =
  "For a file of an installed package that declares TanStack Start: the package's export conditions may give the browser another file than the server; each server function must be defined in one module that every condition re-exports."

const serverFn = (mark: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const pkgPing = createServerFn({ method: 'GET' }).handler(() => '${mark}')
`

describe('Vite production build with RSC: a package whose export conditions give the browser and the server different files', () => {
  test(
    'both conditions re-export one defining module: the build succeeds and the browser call answers',
    async ({ openRscPage, startRscPreviewServer }) => {
      const server = await startRscPreviewServer({
        files: conditionalPackage({
          'fn.js': serverFn('MARK_ONE'),
          'browser.js': `export { pkgPing } from './fn.js'\n`,
          'server.js': `export { pkgPing } from './fn.js'\n`,
        }),
      })
      const page = await openRscPage(server, '/cond')
      await page
        .locator('[data-testid=loader]', { hasText: 'MARK_ONE' })
        .waitFor()
      const response = page.waitForResponse((r) =>
        r.url().includes('/_serverFn/'),
      )
      await page.locator('[data-testid=cond]').click()
      expect((await response).status()).toBe(200)
      await page
        .locator('[data-testid=cond]', { hasText: 'cond MARK_ONE' })
        .waitFor()
    },
    timeout,
  )

  test(
    "each condition's file defines the function: the build fails, naming the browser's file",
    async ({ failedRscBuild }) => {
      const { error } = await failedRscBuild({
        files: conditionalPackage({
          'browser.js': serverFn('MARK_BROWSER'),
          'server.js': serverFn('MARK_SERVER'),
        }),
      })
      const lines = error.split('\n')
      expect(lines).toContain('  - pkgPing of node_modules/pkg-cond/browser.js')
      // the way out for a package that declares Start: its conditions
      // (Gemini's review of the implementation, F6.1: the error told the
      // package to declare Start)
      expect(lines).toContain(conditionalWayOut)
      expect(lines.some((line) => line.includes('must declare'))).toBe(false)
    },
    timeout,
  )
})
