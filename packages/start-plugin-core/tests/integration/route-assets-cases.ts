/**
 * The scripts and stylesheets each route's server-rendered page links in a
 * production build of a React Start app, run for each bundler by its own
 * test file (`route-assets.test.ts`: Vite, `route-assets-rsbuild.test.ts`:
 * Rsbuild, with and without `"sideEffects": false`), the build served as the
 * bundler's preview serves it (Vite: `createStartHost({ serve: false })` +
 * `preview()`; Rsbuild: `buildStart` + `preview()`).
 *
 * Every component and stylesheet of the app carries its own marker (a
 * string in the code, `content: "…"` in the CSS). A route's page is read
 * the way a browser reads it: the stylesheets, module preloads and scripts
 * its HTML links, and the markers of each file they name. A page links what
 * the route renders (none needed missing: the route's own code and CSS, and
 * what it renders from other modules), and nothing that only another route
 * or a lazy boundary needs (none foreign; SPEC J2.22, J5.6, J5.7). What the
 * app shell links on every page (the page of an unknown path) is never
 * foreign.
 *
 * The route `/exported` exports the components it renders, which other
 * modules import through the route file: `Card` (imported by the component
 * of `/`, whose route has its own split groupings), `Chip` (by the
 * components of `/` and `/third`), `Badge` (by the component of `/`; it
 * counts its renders, so the route's chunk shares one instance with the
 * importers rather than carrying a copy), `Tile` (by a lazily loaded module
 * of `/other`) and `Banner` (by the root route, which every page loads).
 * `/shared` has two split options reading the same helper, and `/hyd` two
 * `<Hydrate>` boundaries whose children do.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart } from '../build-harness'
import { createStartHost } from '../start-host'
import { rsbuildEntries } from './route-css-cases'
import type { StartBundler } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** A CSS module whose rule carries the marker `MARK_CSS_<name>`. */
const cssModule = (name: string) =>
  `.m { color: rgb(1, 2, 3); }\n.m::after { content: "MARK_CSS_${name}"; }\n`

/** A component exported by `/exported` (its markers: `MARK_JS_<name>`, `MARK_CSS_<name>`). */
const exportedComponent = (name: string, counts = false) =>
  `import ${name.toLowerCase()}Css from './${name.toLowerCase()}.module.css'
${counts ? `let ${name.toLowerCase()}Renders = 0\n` : ''}export function ${name}() {
${counts ? `  ${name.toLowerCase()}Renders++\n` : ''}  return <b className={${name.toLowerCase()}Css.m}>MARK_JS_${name.toUpperCase()}</b>
}
`

const exportedNames = ['Card', 'Chip', 'Badge', 'Tile', 'Banner']

const files: Record<string, string> = {
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Banner } from './exported'
export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => <p>not found</p>,
})
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Banner />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/exported.tsx': `${head}import pageCss from './exported.module.css'
${exportedNames.map((name) => exportedComponent(name, name === 'Badge')).join('')}export const Route = createFileRoute('/exported')({
  component: () => (
    <p className={pageCss.m}>
      MARK_JS_EXPORTED<Card /><Chip /><Badge /><Tile /><Banner />
    </p>
  ),
})
`,
  'src/routes/index.tsx': `${head}import pageCss from './index.module.css'
import { Badge, Card, Chip } from './exported'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader', 'component']],
  loader: () => 'index data',
  component: () => (
    <p className={pageCss.m}>
      MARK_JS_INDEX<Card /><Chip /><Badge />
    </p>
  ),
})
`,
  'src/routes/third.tsx': `${head}import pageCss from './third.module.css'
import { Chip } from './exported'
export const Route = createFileRoute('/third')({
  component: () => <p className={pageCss.m}>MARK_JS_THIRD<Chip /></p>,
})
`,
  'src/routes/other.tsx': `${head}import { Suspense, lazy } from 'react'
import pageCss from './other.module.css'
const Widget = lazy(() => import('../widget'))
export const Route = createFileRoute('/other')({
  component: () => (
    <p className={pageCss.m}>
      MARK_JS_OTHER
      <Suspense>
        <Widget />
      </Suspense>
    </p>
  ),
})
`,
  'src/widget.tsx': `import { Tile } from './routes/exported'
import widgetCss from './widget.module.css'
export default function Widget() {
  return <i className={widgetCss.m}>MARK_JS_WIDGET<Tile /></i>
}
`,
  'src/routes/plain.tsx': `${head}import pageCss from './plain.module.css'
export const Route = createFileRoute('/plain')({
  component: () => <p className={pageCss.m}>MARK_JS_PLAIN</p>,
})
`,
  'src/routes/shared.tsx': `${head}import helperCss from './sharedhelper.module.css'
function helper() {
  return <u className={helperCss.m}>MARK_JS_SHAREDHELPER</u>
}
export const Route = createFileRoute('/shared')({
  component: () => <p>MARK_JS_SHAREDPAGE{helper()}</p>,
  errorComponent: () => <p>MARK_JS_SHAREDERROR{helper()}</p>,
})
`,
  'src/routes/hyd.tsx': `${head}import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import boundaryCss from './boundary.module.css'
function helper(label: string) {
  return <u className={boundaryCss.m}>MARK_JS_BOUNDARY {label}</u>
}
export const Route = createFileRoute('/hyd')({
  component: () => (
    <section>
      MARK_JS_HYD
      <Hydrate when={interaction()}>
        <b>{helper('a')}</b>
      </Hydrate>
      <Hydrate when={interaction()}>
        <i>{helper('b')}</i>
      </Hydrate>
    </section>
  ),
})
`,
  ...Object.fromEntries(
    [
      ...exportedNames,
      'Exported',
      'Index',
      'Third',
      'Other',
      'Plain',
      'SharedHelper',
      'Boundary',
    ].map((name) => [
      `src/routes/${name.toLowerCase()}.module.css`,
      cssModule(name.toUpperCase()),
    ]),
  ),
  'src/widget.module.css': cssModule('WIDGET'),
}

interface Assets {
  js: Array<string>
  css: Array<string>
}

/**
 * What the page of each route links: `needs`, which it must link, and
 * `may`, which it may link besides (code it loads lazily itself). Anything
 * else is foreign, unless the app shell links it on every page.
 */
const routes: Record<string, { needs: Assets; may?: Partial<Assets> }> = {
  '/exported': {
    needs: {
      js: ['EXPORTED', 'CARD', 'CHIP', 'BADGE', 'TILE', 'BANNER'],
      css: ['EXPORTED', 'CARD', 'CHIP', 'BADGE', 'TILE', 'BANNER'],
    },
  },
  '/': {
    needs: {
      js: ['INDEX', 'CARD', 'CHIP', 'BADGE', 'BANNER'],
      css: ['INDEX', 'CARD', 'CHIP', 'BADGE', 'BANNER'],
    },
  },
  '/third': {
    needs: {
      js: ['THIRD', 'CHIP', 'BANNER'],
      css: ['THIRD', 'CHIP', 'BANNER'],
    },
  },
  '/other': {
    needs: { js: ['OTHER', 'BANNER'], css: ['OTHER', 'BANNER'] },
    // (its lazily imported module)
    may: { js: ['WIDGET', 'TILE'], css: ['WIDGET', 'TILE'] },
  },
  '/plain': {
    needs: { js: ['PLAIN', 'BANNER'], css: ['PLAIN', 'BANNER'] },
  },
  '/shared': {
    needs: {
      js: ['SHAREDPAGE', 'SHAREDHELPER', 'BANNER'],
      css: ['SHAREDHELPER', 'BANNER'],
    },
    // (its own errorComponent)
    may: { js: ['SHAREDERROR'] },
  },
  // The boundaries' children render on the server with their CSS (J5.7);
  // their code loads when they hydrate, not with the route (J5.6).
  '/hyd': {
    needs: { js: ['HYD', 'BANNER'], css: ['BOUNDARY', 'BANNER'] },
  },
}

/** The markers of the files the server-rendered page at `pathname` links, by kind. */
async function linkedMarkers(url: string, pathname: string): Promise<Assets> {
  const response = await fetch(new URL(pathname, url))
  const html = await response.text()
  const hrefs = new Set<string>()
  for (const [, tag, attributes] of html.matchAll(
    /<(link|script)\b([^>]*)>/g,
  )) {
    const rel = /\brel="([^"]*)"/.exec(attributes!)?.[1]
    if (tag === 'link' && rel !== 'stylesheet' && rel !== 'modulepreload') {
      continue
    }
    const href = /\b(?:href|src)="([^"]+)"/.exec(attributes!)?.[1]
    if (href !== undefined) {
      hrefs.add(href.replaceAll('&amp;', '&'))
    }
  }
  const js = new Set<string>()
  const css = new Set<string>()
  for (const href of hrefs) {
    const text = await (await fetch(new URL(href, url))).text()
    for (const [, kind, name] of text.matchAll(/MARK_(JS|CSS)_([A-Z]+)/g)) {
      ;(kind === 'JS' ? js : css).add(name!)
    }
  }
  return { js: [...js].sort(), css: [...css].sort() }
}

const bundlerName = { vite: 'Vite', rsbuild: 'Rsbuild' } as const

/** The rows of `bundler`'s production build (`sideEffects`: the app's `package.json` field). */
export function routeAssetsSuite(bundler: StartBundler, sideEffects?: false) {
  describe(`${bundlerName[bundler]} build${sideEffects === false ? ' with "sideEffects": false' : ''}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    let url: string
    let shell: Assets
    beforeAll(async () => {
      const registerCleanup = (cleanup: () => Promise<void>) => {
        cleanups.push(cleanup)
      }
      if (bundler === 'vite') {
        const host = await createStartHost({
          serve: false,
          files: {
            ...files,
            ...(sideEffects === false && {
              'package.json': JSON.stringify({
                name: 'app',
                private: true,
                type: 'module',
                sideEffects: false,
              }),
            }),
          },
        })
        registerCleanup(() => host.close())
        url = (await host.preview()).url
      } else {
        const build = await buildStart({
          bundler,
          registerCleanup,
          sideEffects,
          files: { ...rsbuildEntries, ...files },
        })
        url = (await build.preview(registerCleanup)).url
      }
      shell = await linkedMarkers(url, '/no-such-route')
    }, timeout)
    afterAll(async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup()
      }
    })

    for (const [pathname, { needs, may }] of Object.entries(routes)) {
      test(
        `the page of ${pathname} links what the route renders and nothing another route or a lazy boundary needs`,
        async () => {
          const linked = await linkedMarkers(url, pathname)
          const missing: Assets = { js: [], css: [] }
          const foreign: Assets = { js: [], css: [] }
          for (const kind of ['js', 'css'] as const) {
            const allowed = new Set([
              ...needs[kind],
              ...(may?.[kind] ?? []),
              ...shell[kind],
            ])
            missing[kind] = needs[kind].filter(
              (name) => !linked[kind].includes(name),
            )
            foreign[kind] = linked[kind].filter((name) => !allowed.has(name))
          }
          expect({ missing, foreign }).toEqual({
            missing: { js: [], css: [] },
            foreign: { js: [], css: [] },
          })
        },
        timeout,
      )
    }
  })
}
