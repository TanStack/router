/**
 * The fixes an import-protection report suggests for a browser-only
 * `'use client'` component a server component renders, applied as the
 * report gives them, in a Vite production build with RSC
 * (rsc-use-client-fix-cases.ts).
 */
import { describe, expect, test } from 'vitest'
import {
  clientOnlyApp,
  deniedApp,
  deniedFiles,
  expectRoutesWork,
  printedFixes,
  renamedApp,
  reportOf,
} from './rsc-use-client-fix-cases'
import { recorder } from './rsc-use-client-app'
import { openRscPage, startRscPreviewServer } from './rsc-serial'

const timeout = 120_000

describe('Vite build with RSC', () => {
  test(
    "the fixes a report prints for a *.client.* 'use client' component, applied as written, build and work in the browser",
    async () => {
      const build = (files: Record<string, string>) =>
        startRscPreviewServer({ start: recorder('error').start, files })
      const report = reportOf(
        await build(deniedApp).then(
          () => 'built',
          (error: unknown) => error,
        ),
      )
      // (no trace of framework and virtual modules: no NUL byte)
      expect(report).not.toContain('\0')
      const { renames, clientOnly } = printedFixes(report)
      expect(renames.map(([from]) => from).sort()).toEqual(deniedFiles)
      expect(clientOnly).toEqual(
        deniedFiles.map(() => '@tanstack/react-router'),
      )

      const renamed = await build(renamedApp(renames))
      await expectRoutesWork(
        renamed.url,
        (pathname) => openRscPage(renamed, pathname),
        'component',
      )
      const wrapped = await build(clientOnlyApp(clientOnly[0]!))
      await expectRoutesWork(
        wrapped.url,
        (pathname) => openRscPage(wrapped, pathname),
        'fallback',
      )
    },
    timeout,
  )
})
