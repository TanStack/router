/**
 * A value the route module keeps and its split component reads, named like a
 * type the route file exports (`export type Config` next to `const Config`).
 * The value is no export of the user's: an edit of the component applies in
 * place, on every edit (SPEC J3.3), with React and `@vitejs/plugin-react` on
 * Vite.
 */
import { expect, test } from 'vitest'
import { inPlace } from '../route-hmr-edit'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 60_000

const route = (text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export type Config = { title: string }
const Config = { title: 'cfg' }
export const Route = createFileRoute('/')({
  loader: () => Config.title,
  component: Page,
})
function Page() {
  return <p data-probe="page">${text} {Config.title}</p>
}
`

test(
  'a value named like an exported type that the split component reads: each text edit applies in place',
  async ({ onTestFinished }) => {
    const app = await openRouteHmrPage({
      onTestFinished,
      files: { 'routes/index.tsx': route('text-v1') },
      ready: 'text-v1 cfg',
    })
    expect(
      await app.edit({ 'routes/index.tsx': route('text-v2') }, 'text-v2 cfg'),
    ).toEqual(inPlace)
    expect(
      await app.edit({ 'routes/index.tsx': route('text-v3') }, 'text-v3 cfg'),
    ).toEqual(inPlace)
  },
  timeout,
)
