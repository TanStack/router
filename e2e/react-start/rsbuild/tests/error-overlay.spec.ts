import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const homeRouteFile = path.resolve(
  import.meta.dirname,
  '../src/routes/index.tsx',
)

test.use({
  whitelistErrors: [
    'Build failed',
    'Module build failed',
    'SyntaxError',
    'Syntax Error',
    'Expression expected',
    // the Start compiler's own error for the route file it cannot parse,
    // reported at its position (Rspack's `Module build failed` no longer wraps it)
    'The compiler cannot parse',
  ],
})

// SPEC §5.7 leaves the wording and the reporting channel free (the bundler
// may report a parse error itself): the overlay shows one issue per runtime,
// each naming the route file, the broken line and an import trace from that
// runtime's entry to the route.
test('shows a module syntax error through the error overlay', async ({
  page,
}) => {
  const originalSource = await fs.promises.readFile(homeRouteFile, 'utf-8')
  await page.goto('/')

  try {
    // the source's line 16
    await fs.promises.writeFile(
      homeRouteFile,
      `${originalSource}\nexport const broken = ;\n`,
    )

    const overlay = page.locator('rsbuild-error-overlay')
    const overlayExpect = expect.configure({ timeout: 30_000 })
    await overlayExpect(overlay.locator('.title')).toBeVisible()
    await overlayExpect(overlay.locator('.title')).toHaveText('Build failed')
    const routeFile = /^\.\/src\/routes\/index\.tsx:\d+:\d+$/
    await overlayExpect(overlay.locator('.file-link')).toHaveText([
      routeFile,
      routeFile,
    ])

    const issues = (await overlay.locator('.content').textContent())!.split(
      /\n+(?=File: )/,
    )
    for (const entry of ['client', 'server']) {
      const issue = issues.find((text) =>
        new RegExp(String.raw`/default-entry/${entry}\.tsx?\n`).test(text),
      )
      // the error's position: in the `File:` header, or in the header of
      // the bundler's code frame when the header gives none (`:1:1`)
      expect(issue).toMatch(
        /^File: \.\/src\/routes\/index\.tsx:16:\d+$|╭─\[(?:[^\]\s]+:)?16:\d+\]/m,
      )
      // the trace's ends: the runtime's entry, then the route tree and the route
      expect(issue).toMatch(
        new RegExp(
          String.raw`Import traces \(entry → error\):\n\s+\S+/default-entry/${entry}\.tsx?\n[^]*\n\s+\./src/routeTree\.gen\.ts\n\s+\./src/routes/index\.tsx\b`,
        ),
      )
    }
  } finally {
    await fs.promises.writeFile(homeRouteFile, originalSource)
  }
})
