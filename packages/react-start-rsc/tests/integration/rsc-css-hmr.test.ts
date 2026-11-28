/**
 * RSC CSS hot updates (SPEC J7.5) on Vite dev (`rsc-app.ts`): editing the
 * CSS of a server component updates the open page's effective styles, the
 * last edit wins, and removing a rule or the import removes its effect, all
 * without a full reload. The Rsbuild counterpart is in
 * rsc-css-rsbuild.test.ts.
 */
import { expect } from 'vitest'
import { waitForHydration, waitForStyle } from './rsc-app'
import { test } from './test'

const card = (
  css: boolean,
) => `${css ? `import styles from './card.module.css'\n` : ''}
export function Card() {
  return <div className={${css ? 'styles.card' : '"card"'}} data-testid="card">MARK_CARD</div>
}
`
const route = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Card } from '../card'
const render = createServerFn().handler(() => renderServerComponent(<Card />))
export const Route = createFileRoute('/')({
  loader: () => render(),
  component: () => <main>{Route.useLoaderData()}</main>,
})
`
const styles = (background: string) => `.card { background: ${background}; }\n`

test("editing a server component's CSS updates the page without a full reload", async ({
  openRscPage,
  page,
  pageErrors,
  startRscDevServer,
}) => {
  const server = await startRscDevServer({
    browser: true,
    files: {
      'src/card.module.css': styles('#fef3c7'),
      'src/card.tsx': card(true),
      'src/routes/index.tsx': route,
    },
  })
  let loads = 0
  page.on('load', () => loads++)
  await openRscPage(server, '/')
  await page.locator('body', { hasText: 'MARK_CARD' }).waitFor()
  const background = (expected: string) =>
    waitForStyle(page, '[data-testid=card]', 'background-color', expected)
  await background('rgb(254, 243, 199)')

  await waitForHydration(page)

  // A new value
  await server.write({ 'src/card.module.css': styles('#e0f2fe') })
  await background('rgb(224, 242, 254)')

  // Twice in a row: the last edit wins, nothing stale stays effective
  await server.write({ 'src/card.module.css': styles('#fef3c7') })
  await server.write({ 'src/card.module.css': styles('rgb(1, 2, 3)') })
  await background('rgb(1, 2, 3)')

  // The rule removed
  await server.write({ 'src/card.module.css': `.other { color: red; }\n` })
  await background('rgba(0, 0, 0, 0)')

  // The rule back, then the import removed
  await server.write({ 'src/card.module.css': styles('#fef3c7') })
  await background('rgb(254, 243, 199)')
  await server.write({ 'src/card.tsx': card(false) })
  await background('rgba(0, 0, 0, 0)')

  expect(loads).toBe(1)
  expect(pageErrors).toEqual([])
})
