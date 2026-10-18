import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startRscDevServer } from './rsc-app'

test('spike: a server component with a CSS module styles the page', async () => {
  const server = await startRscDevServer({
    browser: true,
    files: {
      'src/card.module.css': `.card { background: #fef3c7; border-radius: 18px; }\n`,
      'src/card.tsx': `import styles from './card.module.css'
export function Card() {
  return <div className={styles.card} data-testid="card">MARK_CARD</div>
}
`,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Card } from '../card'
const getCard = createServerFn().handler(() => renderServerComponent(<Card />))
export const Route = createFileRoute('/')({
  loader: () => getCard(),
  component: () => <main>{Route.useLoaderData()}</main>,
})
`,
    },
  })
  console.log(server.url, server.logs)
  const page = await openPage(`${server.url}/`, {
    registerCleanup: onTestFinished,
  })
  await page.waitForText('MARK_CARD')
  const style = await page.page
    .locator('[data-testid=card]')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(page.console, page.errors, server.logs)
  expect(style).toBe('rgb(254, 243, 199)')
})
