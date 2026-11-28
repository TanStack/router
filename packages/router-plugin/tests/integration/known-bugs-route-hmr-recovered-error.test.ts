import { test } from 'vitest'
import { openRouteHmrPage } from '../serial'
/**
 * Route HMR after a render error the page recovered from without a route
 * edit (a navigation resets the boundary): a later route edit updates in
 * place. Only the global boundary of a hydrated root, which loses the
 * document it renders, makes route edits reload the page (R70); a
 * client-only root's boundaries recover in place (oracle/KNOWN-BUGS.md,
 * "Fixed": R3-G9-2).
 */

const throwing = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
function Page(): never {
  throw new Error('page broke')
}
`

const other = (
  version: string,
) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({
  component: () => <p>other ${version}</p>,
})
`

test('react, vite: a route edit after a render error the page navigated away from updates in place', async ({
  expect,
}) => {
  const app = await openRouteHmrPage({
    files: { 'routes/index.tsx': throwing, 'routes/other.tsx': other('v1') },
    ready: 'Something went wrong!',
  })
  await app.evaluate(`void window.__APP_ROUTER__.navigate({ to: '/other' })`)
  await app.page.waitForText('other v1', { selector: '#app' })
  const edited = await app.edit({ 'routes/other.tsx': other('v2') }, 'other v2')
  expect(edited.reloaded).toBe(false)
})
