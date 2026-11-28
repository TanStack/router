import { describe, expect, test } from 'vitest'
import { answeredText, waitForHydration } from './rsc-app'
import { openRscPage, startRscDevServer } from './rsc-serial'

describe('Vite dev: a separate RSC provider', () => {
  // SPEC J4.2 / #7943: a server function declared in a `'use client'`
  // module runs on the server when the client calls it.
  // On main, a server fn co-located with a client component cannot be called.
  // Source: the compile-level pin in start-plugin-core
  // tests/start-compiler-cases.test.ts.
  test("a server function of a 'use client' module runs on the server", async () => {
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
    await browser.locator('body', { hasText: /widget/ }).waitFor()
    await waitForHydration(browser)
    await browser.locator('[data-testid=widget]').click()
    // The answer, or what the page shows once its requests are done
    expect(
      await answeredText(browser, '[data-testid=widget]', (text) =>
        text.includes('MARK_WIDGET_DATA'),
      ),
    ).toBe('widget MARK_WIDGET_DATA')
  })
})
