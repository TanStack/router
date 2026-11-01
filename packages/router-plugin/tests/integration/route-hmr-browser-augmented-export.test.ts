/**
 * An exported component the route file augments (`Page.displayName = …`)
 * stays in the route module in dev with its augmentation (in a build it is
 * extracted into its own module with it), and the split chunk
 * imports it (SPEC J2.4, J3.3): an edit of the component applies in place
 * through the route module, with React Refresh registering the component
 * where it is declared, and the augmentation is kept across edits.
 */
import { expect, test } from 'vitest'
import { inPlace } from '../route-hmr-edit'
import { openRouteHmrPage } from '../route-hmr-page'

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
  async ({ onTestFinished }) => {
    const app = await openRouteHmrPage({
      onTestFinished,
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
