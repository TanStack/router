import { describe, expect, test } from 'vitest'
import {
  openRscPage,
  settledValue,
  startRscDevServer,
  waitForHydration,
} from './rsc-app'

describe('Vite dev: a separate RSC provider', () => {
  // SPEC J4.2 / #7943: a server function declared in a `'use client'`
  // module runs on the server when the client calls it.
  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module, so the RSC bundler turns the provider's
  // exports into client references and the handler is not there to run.
  // Impact: a server fn co-located with a client component cannot be called.
  // Source: the compile-level pin in start-plugin-core
  // tests/known-bugs-start-compiler.test.ts.
  test(
    "a server function of a 'use client' module runs on the server",
    async () => {
      const server = await startRscDevServer({
        browser: true,
        files: {
          'src/widget.tsx': `'use client'
import { useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
const getData = createServerFn().handler(() => 'MARK_WIDGET_DATA')
export function Widget() {
  const [data, setData] = useState('')
  return <button data-testid="widget" onClick={() => getData().then(setData)}>widget {data}</button>
}
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widget } from '../widget'
export const Route = createFileRoute('/')({ component: () => <main><Widget /></main> })
`,
        },
      })
      const browser = await openRscPage(server, '/')
      await browser.waitForText('widget')
      await waitForHydration(browser)
      await browser.page.locator('[data-testid=widget]').click()
      // The answer, or what the page shows once its requests are done
      expect(
        await settledValue(
          browser,
          () => browser.text('[data-testid=widget]'),
          (text) => text.includes('MARK_WIDGET_DATA'),
        ),
      ).toBe('widget MARK_WIDGET_DATA')
    },
  )
})
