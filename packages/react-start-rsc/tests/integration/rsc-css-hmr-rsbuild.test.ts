import { expect, test } from 'vitest'
import { startRscRsbuildDevServer, waitForStyle } from './rsc-app'
import { CARD_BACKGROUND, appFiles, rows, show } from './rsc-css-rsbuild-app'

// SPEC J7.5 on Rsbuild: editing a server component's CSS updates the open
// page's effective styles without a full reload.
test("Rsbuild: editing a server component's CSS updates the page without a full reload", async () => {
  const styles = (background: string) =>
    `.card { background: ${background}; }\n`
  const server = await startRscRsbuildDevServer({
    browser: true,
    files: { ...appFiles, 'src/card.module.css': styles('#fef3c7') },
  })
  const page = await show(server, rows[1]!.path)
  await waitForStyle(
    page,
    '[data-testid=card]',
    'background-color',
    CARD_BACKGROUND,
    5_000,
  )

  await server.edit({ 'src/card.module.css': styles('#e0f2fe') })
  expect(server.errors).toEqual([])
  await waitForStyle(
    page,
    '[data-testid=card]',
    'background-color',
    'rgb(224, 242, 254)',
  )
  expect(page.loads()).toBe(1)
  expect(page.errors).toEqual([])
})
