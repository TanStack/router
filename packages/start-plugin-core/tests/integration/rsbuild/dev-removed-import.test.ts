/**
 * A file a route component reads, deleted and restored on Start's Rsbuild
 * dev server, in a real page with each framework's own hot updates
 * (`@rsbuild/plugin-react`, `@rsbuild/plugin-solid`): the page shows the
 * restored file, and edits after it apply in place (the Vite rows:
 * `../start-dev-removed-import.test.ts`). React shows it with the return's
 * own update; Solid after a reload by Rsbuild's client at the return (no
 * router reload; not asserted either way).
 */
import { describe, expect, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { openTestPage } from '../../test-page'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { reactApp, solidApp } from '../hydrate-dev-edits'
import { solidAppConfig } from '../hydrate-pages'

type Fw = 'react' | 'solid'

/** `src/routes/index.tsx`: its component renders `label` of `src/dep.ts`. */
const route = (fw: Fw, step: number) =>
  `import { createFileRoute } from '@tanstack/${fw}-router'
import { label } from '../dep'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <p data-probe="home">{label + ' step-${step}'}</p>
}
`
const dep = (label: string) => `export const label = '${label}'\n`

async function open(fw: Fw) {
  const server = await startRsbuildStartDevServer({
    hmr: true,
    browser: true,
    // Start serves the pages, not an HTML template
    ...(fw === 'react'
      ? { config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] } }
      : {
          framework: 'solid',
          config: {
            ...solidAppConfig.rsbuildConfig,
            tools: { htmlPlugin: false },
          },
        }),
    files: {
      ...(fw === 'react' ? reactApp : solidApp),
      'src/dep.ts': dep('DEP_FIRST'),
      'src/routes/index.tsx': route(fw, 1),
    },
  })
  const page = await openTestPage(server.url!)
  await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  await page.waitForText('DEP_FIRST step-1', { selector: '[data-probe=home]' })
  return { server, page }
}

describe('Rsbuild dev: a file a route component reads, deleted and restored', () => {
  test.each(['react', 'solid'] as const)(
    '%s: the page shows the restored file, edits after it apply in place',
    async (fw) => {
      const { server, page } = await open(fw)
      const loads = page.loads()
      await server.edit({ 'src/dep.ts': null })
      await server.edit({ 'src/dep.ts': dep('DEP_BACK') })
      await page.waitForText('DEP_BACK step-1', {
        selector: '[data-probe=home]',
      })
      if (fw === 'react') {
        expect(page.loads() - loads).toBe(0)
      }
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      const restored = page.loads()
      for (const step of [2, 3]) {
        await server.edit({ 'src/routes/index.tsx': route(fw, step) })
        await page.waitForText(`DEP_BACK step-${step}`, {
          selector: '[data-probe=home]',
        })
      }
      expect(page.loads() - restored).toBe(0)
    },
  )
})
