/**
 * Route edits after the route file's split layout changed and changed back
 * (SPEC J3.3): the derived modules an earlier layout produced (a split chunk
 * after `codeSplitGroupings: []`; the chunk's copy of a component once it is
 * exported, since in dev an exported component stays in the route module,
 * R77 dev) are no longer imported, or import other things, and an edit of
 * the file must still apply in place. Found by the HMR consistency fuzzer:
 * a stale derived module stayed in Vite's module graph with no importers,
 * and the next edit of the file full-reloaded the page.
 */
import { describe, expect, test } from 'vitest'
import { inPlace } from '../route-hmr-edit'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 60_000

const route = (
  text: string,
  exported = false,
  nosplit = false,
  written = false,
) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({${nosplit ? '\n  codeSplitGroupings: [],' : ''}
  component: Page,
})
${exported ? 'export ' : ''}function Page() {
  return <p data-probe="page">${text}</p>
}
${written ? "Page.displayName = 'Page'\n" : ''}`

describe('Vite dev: route edits after the split layout changed and changed back', () => {
  test(
    'the component exported, then not: a text edit applies in place',
    async ({ onTestFinished }) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { 'routes/index.tsx': route('text-v1') },
        ready: 'text-v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': route('text-v2', true) },
          'text-v2',
        ),
      ).toEqual(inPlace)
      expect(
        await app.edit({ 'routes/index.tsx': route('text-v3') }, 'text-v3'),
      ).toEqual(inPlace)
      expect(
        await app.edit({ 'routes/index.tsx': route('text-v4') }, 'text-v4'),
      ).toEqual(inPlace)
    },
    timeout,
  )

  test(
    'the component unsplit, then split again: each edit applies in place',
    async ({ onTestFinished }) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { 'routes/index.tsx': route('text-v1') },
        ready: 'text-v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': route('text-v2', false, true) },
          'text-v2',
        ),
      ).toEqual(inPlace)
      expect(
        await app.edit({ 'routes/index.tsx': route('text-v3') }, 'text-v3'),
      ).toEqual(inPlace)
      expect(
        await app.edit({ 'routes/index.tsx': route('text-v4') }, 'text-v4'),
      ).toEqual(inPlace)
    },
    timeout,
  )

  test(
    'the exported component written, then not: each edit applies in place',
    async ({ onTestFinished }) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { 'routes/index.tsx': route('text-v1', true) },
        ready: 'text-v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': route('text-v2', true, false, true) },
          'text-v2',
        ),
      ).toEqual(inPlace)
      expect(
        await app.edit(
          { 'routes/index.tsx': route('text-v3', true, false, true) },
          'text-v3',
        ),
      ).toEqual(inPlace)
      expect(
        await app.edit(
          { 'routes/index.tsx': route('text-v4', true) },
          'text-v4',
        ),
      ).toEqual(inPlace)
    },
    timeout,
  )
})
