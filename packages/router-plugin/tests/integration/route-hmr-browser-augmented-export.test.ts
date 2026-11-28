/**
 * An exported component the route file augments (`Page.displayName = …`)
 * and gives as the route's component stays in the route module with its
 * augmentation (an exported option value is not split, as on main; R153):
 * an edit of the component applies in place through the route module, with
 * React Refresh registering the component where it is declared, and the
 * augmentation is kept across edits.
 */
import { expect } from 'vitest'
import { inPlace } from '../route-hmr-edit'
import { test } from '../test'

const timeout = 60_000

const route = (text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: Page,
})
export function Page() {
  return <p data-probe="page">${text} {Page.displayName}</p>
}
Page.displayName = 'Named'
`

test(
  'an exported component with a displayName: each text edit applies in place and keeps the name',
  async ({ openRouteHmrPage }) => {
    const app = await openRouteHmrPage({
      files: { 'routes/index.tsx': route('text-v1') },
      ready: 'text-v1 Named',
    })
    expect(
      await app.edit({ 'routes/index.tsx': route('text-v2') }, 'text-v2 Named'),
    ).toEqual(inPlace)
    expect(
      await app.edit({ 'routes/index.tsx': route('text-v3') }, 'text-v3 Named'),
    ).toEqual(inPlace)
  },
  timeout,
)
