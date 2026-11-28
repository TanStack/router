/**
 * Installed packages that use Start on a Vite dev server, whose dependency
 * optimizer pre-bundles them: the compile sees the optimizer's bundle
 * (`node_modules/.vite/deps/…`, or wherever the app keeps its `cacheDir`),
 * which may hold several packages' modules. What is reported is about the
 * module each finding is in (the bundle's map), never the optimizer's
 * cache:
 * - the package warning (node_modules policy, decision 6) names each
 *   package a recognised Start use is in, with that package's remedy, once
 *   per package; a package that only imports the router is not one;
 * - the bundle is installed code: advice for its author is not reported
 *   (A2), and an error names the package the refused code is in.
 * The client page loads the packages through the optimizer, as an app's
 * page does; a rendered page's server compiles the client's bundle too.
 * Source: diagnostics spike (2026-11-24), inventory flag 1, agreed changes
 * A1 and A2 (`pkg-undeclared`, `pkg-unreached` of the harness shapes); the
 * implementation reviews (Fable p1, p1b, p2, p3; Astra 1, 2, 3; Gemini
 * P0-1, P1-1).
 */
import { describe, expect, test } from 'vitest'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { openTestPage } from '../test-close'
import { startDevServer } from '../dev-server'
import { appManifest, installPackage } from '../package-layouts'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import { rootDocument, routerFile } from './start-compose-app'
import type { InstalledPackage, StartDeclaration } from '../package-layouts'
import type { Plugin } from 'vite'

const timeout = 60_000

/** `name`, a package whose `index.js` makes a server fn builder. */
const usesStart = (name: string, declaration: StartDeclaration) =>
  installPackage('npm', {
    name,
    declaration,
    files: {
      'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn({ method: 'POST' })\n`,
    },
  })

/**
 * The dev server of a client page importing `imports` (`packages`
 * installed, `listed` in the app's manifest), after the page loaded it, or
 * failed to (`fails`).
 */
async function devPage(
  packages: ReadonlyArray<InstalledPackage>,
  listed: ReadonlyArray<InstalledPackage>,
  imports: string,
  options: {
    cacheDir?: string
    fails?: true
    optimize?: Array<string>
    plugins?: Array<Plugin>
  } = {},
) {
  const server = await startBrowserStartDevServer({
    files: {
      ...Object.assign({}, ...packages.map((p) => p.files)),
      'package.json': JSON.stringify(appManifest(listed)),
      'src/entry.ts': `${imports}\nexport const kind = () => 'loaded'\n`,
    },
    // (a kit's router import resolves as installed: the app's own)
    symlinks: Object.assign(
      workspacePackageLinks(['@tanstack/react-router']),
      ...packages.map((p) => p.symlinks),
    ),
    config: {
      ...(options.cacheDir !== undefined && { cacheDir: options.cacheDir }),
      ...(options.optimize && { optimizeDeps: { include: options.optimize } }),
    },
    // (before Start's transform, as an app listing them first)
    ...(options.plugins && { plugins: options.plugins, startLast: true }),
  })
  const loaded = runViteClient(server, '/src/entry.ts', 'return entry.kind()')
  if (options.fails) {
    await expect(loaded).rejects.toThrow()
  } else {
    expect((await loaded).result).toBe('loaded')
  }
  const reported = problems(server.diagnostics)
  return {
    root: server.root,
    reported,
    warnings: reported.filter((d) => d.severity === 'warning'),
  }
}

/** The warnings naming `lib`'s module `index.js`. */
const naming = (
  { root, warnings }: { root: string; warnings: ReturnType<typeof problems> },
  lib: InstalledPackage,
) => findDiagnostics(warnings, { file: `${lib.directory}/index.js`, root })

const notTheCache = (warnings: ReturnType<typeof problems>) =>
  expect(warnings.map((d) => d.text).join('\n')).not.toMatch(
    /node_modules\/\.vite|\.cache\/vite/,
  )

describe('vite dev, a pre-bundled package that uses Start', () => {
  test(
    "a package that does not declare Start: the warning names its module and its manifest, not the optimizer's cache",
    async () => {
      const lib = usesStart('fake-sfn', 'none')
      const page = await devPage(
        [lib],
        [lib],
        `import { base } from 'fake-sfn'\nexport { base }`,
      )
      const named = naming(page, lib)
      expect(named).toHaveLength(1)
      expect(named[0]!.text).toContain(`${lib.directory}/package.json`)
      expect(named[0]!.text).toContain('as a peer dependency')
      notTheCache(page.warnings)
    },
    timeout,
  )

  test(
    "a package that declares Start but the app does not list: the warning asks to list it in the app's dependencies",
    async () => {
      const lib = usesStart('fake-sfn', 'peer')
      const page = await devPage(
        [lib],
        [],
        `import { base } from 'fake-sfn'\nexport { base }`,
      )
      const named = naming(page, lib)
      expect(named).toHaveLength(1)
      expect(named[0]!.text).toContain(
        "List fake-sfn in the app's dependencies",
      )
      notTheCache(page.warnings)
    },
    timeout,
  )

  // The optimizer bundles a package's dependencies into its bundle: the
  // Start use is the inner package's, which the warning names; the package
  // the app imports uses no Start API, also when it imports the router
  // (a UI kit's `useRouter`).
  test.each([
    { name: 're-exports it', outer: `export { base } from 'inner-sfn'\n` },
    {
      name: 'imports the router and calls it',
      outer: `import { useRouter } from '@tanstack/react-router'\nexport const useKit = () => useRouter()\nexport { base } from 'inner-sfn'\n`,
    },
  ])(
    'a package the optimizer inlines into another package that $name: the warning names the inner package',
    async ({ outer }) => {
      const inner = usesStart('inner-sfn', 'none')
      const kit = installPackage('npm', {
        name: 'outer-lib',
        manifest: { dependencies: { 'inner-sfn': '1.0.0' } },
        files: { 'index.js': outer },
      })
      const page = await devPage(
        [inner, kit],
        [kit],
        `import * as kit from 'outer-lib'\nexport { kit }`,
      )
      expect(naming(page, inner)).toHaveLength(1)
      expect(naming(page, inner)[0]!.text).toContain(
        `${inner.directory}/package.json`,
      )
      expect(naming(page, kit)).toEqual([])
      notTheCache(page.warnings)
    },
    timeout,
  )

  // A Start factory the inner package takes through a barrel of its own:
  // the bundle maps the call to the inner package's module, which imports
  // no Start package by name.
  test(
    'a package calling a Start factory through its own barrel, inlined into a router-using kit: the warning names the package that calls it',
    async () => {
      const inner = installPackage('npm', {
        name: 'inner-sfn',
        files: {
          'start.js': `export { createServerFn } from '@tanstack/react-start'\n`,
          'index.js': `import { createServerFn } from './start.js'\nexport const base = createServerFn({ method: 'POST' })\n`,
        },
      })
      const kit = installPackage('npm', {
        name: 'outer-kit',
        manifest: { dependencies: { 'inner-sfn': '1.0.0' } },
        files: {
          'index.js': `import { createRouter } from '@tanstack/react-router'\nexport const makeRouter = createRouter\nexport { base } from 'inner-sfn'\n`,
        },
      })
      const page = await devPage(
        [inner, kit],
        [kit],
        `import * as kit from 'outer-kit'\nexport { kit }`,
      )
      expect(naming(page, inner)).toHaveLength(1)
      expect(naming(page, kit)).toEqual([])
      notTheCache(page.warnings)
    },
    timeout,
  )

  // A plugin before Start's transform edits the pre-bundle (a license
  // banner): the uses are offsets of that text, which the optimizer's map
  // does not describe, so no package is told to change its manifest
  // (Astra's re-check of the implementation, 1: the warning blamed
  // `outer-kit`).
  test(
    'a pre-bundle another plugin edited first: no package is named',
    async () => {
      // (Astra's shape: the factory from a Start package's re-export, the
      // call in `fake-sfn`, the kit's code right after it in the bundle)
      const bridge = installPackage('npm', {
        name: 'builder-bridge',
        declaration: 'peer',
        files: {
          'index.js': `export { createServerFn as make } from '@tanstack/react-start'\n`,
        },
      })
      const inner = installPackage('npm', {
        name: 'fake-sfn',
        manifest: { dependencies: { 'builder-bridge': '1.0.0' } },
        files: {
          'index.js': `import { make } from 'builder-bridge'\nexport const getX = make().handler(async () => 'MARK')\n`,
        },
      })
      const kit = installPackage('npm', {
        name: 'outer-kit',
        manifest: { dependencies: { 'fake-sfn': '1.0.0' } },
        files: {
          'index.js': `import { createRouter } from '@tanstack/react-router'\nimport { getX as load } from 'fake-sfn'\nexport const getX = () => typeof createRouter === 'function' ? load() : undefined\n`,
        },
      })
      const banner: Plugin = {
        name: 'test:license-banner',
        enforce: 'pre',
        transform(code, id) {
          return /\/deps\/outer-kit\.js(\?|$)/.test(id)
            ? { code: `/* license banner */\n\n${code}`, map: null }
            : null
        },
      }
      const run = (plugins: Array<Plugin>) =>
        devPage(
          [bridge, inner, kit],
          [kit],
          `import { getX } from 'outer-kit'\nexport { getX }`,
          { plugins },
        )
      // (the control: the call is `fake-sfn`'s)
      const control = await run([])
      expect(naming(control, inner)).toHaveLength(1)
      expect(naming(control, kit)).toEqual([])
      const edited = await run([banner])
      expect(naming(edited, kit)).toEqual([])
      expect(naming(edited, inner)).toEqual([])
      notTheCache(edited.warnings)
    },
    timeout,
  )

  test(
    'two packages that do not declare Start in one bundle: one warning for each',
    async () => {
      const inner = usesStart('inner-sfn', 'none')
      const outer = installPackage('npm', {
        name: 'outer-sfn',
        manifest: { dependencies: { 'inner-sfn': '1.0.0' } },
        files: {
          'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport { base } from 'inner-sfn'\nexport const own = createServerFn({ method: 'GET' })\n`,
        },
      })
      const page = await devPage(
        [inner, outer],
        [outer],
        `import * as lib from 'outer-sfn'\nexport { lib }`,
      )
      expect(naming(page, inner)).toHaveLength(1)
      expect(naming(page, outer)).toHaveLength(1)
      notTheCache(page.warnings)
    },
    timeout,
  )

  // Wherever the app keeps the optimizer's cache, its bundles are installed
  // code (Astra: `cacheDir: '.cache/vite'` lost the package warning).
  test(
    'a cacheDir outside node_modules: the package warning names the package',
    async () => {
      const lib = usesStart('fake-sfn', 'none')
      const page = await devPage(
        [lib],
        [lib],
        `import { base } from 'fake-sfn'\nexport { base }`,
        {
          cacheDir: '.cache/vite',
        },
      )
      expect(naming(page, lib)).toHaveLength(1)
      notTheCache(page.warnings)
    },
    timeout,
  )
})

/** A middleware factory reading its parameter in `.server()`. */
const middlewareSource = `import { createMiddleware } from '@tanstack/react-start'
export const guard = (options) => createMiddleware({ type: 'function' }).server(async ({ next }) => { if (options.rule !== 'MARK_RULE') { throw new Error('denied') } return next() })
`

/** `mw-lib`, the middleware factory, declaring no Start. */
const middlewareLib = installPackage('npm', {
  name: 'mw-lib',
  files: { 'index.js': middlewareSource },
})

describe('vite dev, a pre-bundled package is installed code', () => {
  // A workspace package the app asks Vite to pre-bundle: its source is the
  // user's, which the optimizer's map names (Astra's re-check, 2).
  test(
    'a workspace package in optimizeDeps.include keeps the advice for its author',
    async () => {
      const lib = installPackage('workspace', {
        name: 'mw-lib',
        files: { 'index.js': middlewareSource },
      })
      const page = await devPage(
        [lib],
        [lib],
        `import { guard } from 'mw-lib'\nexport const mw = guard({ rule: 'MARK_RULE' })`,
        { optimize: ['mw-lib'] },
      )
      expect(
        page.warnings.filter(({ text }) =>
          text.includes('Only server code reads `options`'),
        ),
      ).toHaveLength(1)
    },
    timeout,
  )

  test.each([
    { name: 'in node_modules/.vite', cacheDir: undefined },
    { name: 'in a cacheDir outside node_modules', cacheDir: '.cache/vite' },
  ])(
    'advice for its author is not reported ($name)',
    async ({ cacheDir }) => {
      const page = await devPage(
        [middlewareLib],
        [middlewareLib],
        `import { guard } from 'mw-lib'\nexport const mw = guard({ rule: 'MARK_RULE' })`,
        { cacheDir },
      )
      // (the package warning: it does not declare Start)
      expect(naming(page, middlewareLib)).toHaveLength(1)
      expect(page.warnings).toHaveLength(1)
    },
    timeout,
  )

  test(
    'an error names the package the refused code is in',
    async () => {
      const lib = installPackage('npm', {
        name: 'old-lib',
        files: {
          'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const fn = createServerFn().inputValidator((d) => d).handler(async () => 'MARK')\n`,
        },
      })
      const page = await devPage(
        [lib],
        [lib],
        `import { fn } from 'old-lib'\nexport { fn }`,
        {
          fails: true,
        },
      )
      const errors = page.reported.filter((d) => d.severity === 'error')
      expect(errors).not.toEqual([])
      for (const { text } of errors) {
        expect(text).toContain('installed package `old-lib`')
      }
    },
    timeout,
  )
})

// A page that calls a package's server fn: the client registers it from the
// optimizer's bundle, so the server compiles that bundle to run its handler
// (harness rows `pkg-undeclared`, `pkg-unreached`: a second warning naming
// `node_modules/.vite/package.json`, from `compiler:ssr:dependencies`,
// before the bundle was told by `cacheDir`).
describe("vite dev, a page calling a pre-bundled package's server fn", () => {
  test(
    'a package that does not declare Start: one warning, naming the package, and the call answers',
    async () => {
      const lib = installPackage('npm', {
        name: 'fake-sfn',
        files: {
          'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const ping = createServerFn().handler(async () => 'MARK_PING')\n`,
        },
      })
      const server = await startDevServer({
        browser: true,
        files: {
          ...lib.files,
          'package.json': JSON.stringify(appManifest([lib])),
          'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
          'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ping } from 'fake-sfn'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [text, setText] = useState('idle')
  return <button data-testid="probe" onClick={async () => setText('got=' + (await ping()))}>{text}</button>
}
`,
        },
      })
      const page = await openTestPage(server.url!)
      await page.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await page.page.locator('[data-testid=probe]').click()
      await page.waitForText('got=MARK_PING', {
        selector: '[data-testid=probe]',
      })
      const warnings = problems(server.diagnostics).filter(
        (d) => d.severity === 'warning',
      )
      expect(naming({ root: server.root, warnings }, lib)).toHaveLength(1)
      notTheCache(warnings)
    },
    timeout,
  )
})
