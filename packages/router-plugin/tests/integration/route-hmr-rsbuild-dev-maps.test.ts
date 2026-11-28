/**
 * The source maps an Rsbuild dev server serves after a route file edit:
 * every map a freshly loaded page's scripts point to that names the route
 * file holds the file as it is on disk (what a debugger shows after a
 * reload or in a new tab), also the map of a split chunk whose code the
 * edit left unchanged (an edit of the loader the route module keeps), and
 * of the route module after an edit of the split component only. The edits
 * stay hot updates in place.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe } from 'vitest'
import { it } from '../test'
import type { RouteHmrPage } from '../route-hmr-page'

const timeout = 90_000

const inPlace = { reloaded: false, errors: [] }

/** A split route: the loader stays in the route module, the component is split. */
const route = (loader: string, page: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => '${loader}',
  component: Page,
})
function Page() {
  return <p>${page} {Route.useLoaderData()}</p>
}
`

/** The file a source of a map served at `mapUrl` names (`webpack://<namespace>/` names resolve from `root`), without its query. */
function sourceFile(source: string, mapUrl: string, root: string): string {
  const webpack = /^webpack:\/\/[^/]*\/(.*)$/.exec(source)
  const file = webpack
    ? path.resolve(root, webpack[1]!)
    : source.startsWith('/')
      ? source
      : new URL(source, mapUrl).pathname
  return file.split('?')[0]!
}

/**
 * Reloads the page until it shows `shows`, then, for every script it
 * loaded, the map the dev server serves for it now, and per source naming
 * `file` the text the map holds for it.
 */
async function servedTexts(
  app: RouteHmrPage,
  file: string,
  shows: string,
): Promise<Array<{ map: string; text: string | null }>> {
  const { page } = app.page
  await page.reload()
  await app.page.waitForText(shows, { selector: '#app' })
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\.js(?:\?|$)/.test(name)),
  )
  const texts: Array<{ map: string; text: string | null }> = []
  for (const script of new Set(scripts)) {
    const code = await (await fetch(script)).text()
    const mapping = [...code.matchAll(/[#@] sourceMappingURL=(\S+)\s*$/gm)].at(
      -1,
    )?.[1]
    if (mapping === undefined || mapping.startsWith('data:')) {
      continue
    }
    const mapUrl = new URL(mapping, script).href
    const map = (await (await fetch(mapUrl)).json()) as {
      sources: Array<string | null>
      sourcesContent?: Array<string | null>
    }
    map.sources.forEach((source, i) => {
      if (source !== null && sourceFile(source, mapUrl, app.root) === file) {
        texts.push({ map: mapUrl, text: map.sourcesContent?.[i] ?? null })
      }
    })
  }
  return texts
}

describe('rsbuild: the maps of a split route after an edit', () => {
  it(
    'hold the route file as it is on disk, also where the edit left the code unchanged',
    { timeout },
    async ({ expect, openRouteHmrPage }) => {
      const app = await openRouteHmrPage({
        bundler: 'rsbuild',
        files: { 'routes/index.tsx': route('loader v1', 'page v1') },
        ready: 'page v1 loader v1',
      })
      const file = path.join(app.root, 'routes/index.tsx')
      const expectCurrent = async (shows: string) => {
        const texts = await servedTexts(app, file, shows)
        // the route module's and the split component's
        expect(texts.length, 'maps naming the route file').toBeGreaterThan(1)
        const current = await readFile(file, 'utf8')
        for (const { map, text } of texts) {
          expect(text, map).toBe(current)
        }
      }
      await expectCurrent('page v1 loader v1')
      // the split component's code is unchanged
      expect(
        await app.edit(
          { 'routes/index.tsx': route('loader v2', 'page v1') },
          'page v1 loader v2',
        ),
      ).toEqual(inPlace)
      await expectCurrent('page v1 loader v2')
      // the route module's code is unchanged
      expect(
        await app.edit(
          { 'routes/index.tsx': route('loader v2', 'page v2') },
          'page v2 loader v2',
        ),
      ).toEqual(inPlace)
      await expectCurrent('page v2 loader v2')
    },
  )
})
