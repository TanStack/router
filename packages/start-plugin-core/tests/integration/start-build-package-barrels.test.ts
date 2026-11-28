/**
 * A builder an installed package that does not declare Start makes in a
 * shared chunk and forwards from its entry, in the forms library bundlers
 * print, or forwards from a package that declares Start (node_modules
 * policy decision 11; D-21): the entry is read like a re-export, so the
 * app's handler built on it leaves the client.
 * Source: barrel-form study (2026-11-25), survey of current library
 * bundlers; before it, `export { x } from` was followed and
 * `import { x } from …; export { x }` was not. Reviews of 3c79e6cb74: a
 * comment inside either list must not change the reading.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { callByIdExports, startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import { appManifest, installPackage } from '../package-layouts'
import type { StartBundler } from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 60_000

/** The shared chunk, exporting the builder as `exported`. */
const chunk = (exported: string) =>
  `import { createServerFn } from "@tanstack/react-start";\nconst base = createServerFn({ method: "POST" });\nexport { base as ${exported} };\n`

/** Entry forms, each with the name its chunk exports the builder by (survey of 2026-11-25, current releases). */
const forms: Array<[string, string, string]> = [
  // esbuild 0.28.2 (`splitting`), tsup 9.0.0
  [
    'esbuild: an import, then an export list',
    'base',
    `import {\n  base\n} from "./chunk.js";\nexport {\n  base\n};\n`,
  ],
  // esbuild and tsup, minified
  [
    'esbuild, minified: renamed both ways',
    'a',
    `import{a as e}from"./chunk.js";export{e as base};`,
  ],
  // Rolldown 1.3.3, tsdown 0.23.7, Vite 8.3.8 library mode: an entry with code of its own
  [
    'Rolldown: an export list with a local beside the import',
    't',
    `import { t as base } from "./chunk.js";\n\n// src/index.ts\nconst version = "1.0.0";\n\nexport { base, version };\n`,
  ],
  // Rollup 4.68.8, unbuild 3.6.1
  [
    'Rollup: a renamed re-export',
    'b',
    `export { b as base } from './chunk.js';\nimport '@tanstack/react-start';\n`,
  ],
  // Rslib 1.0.7
  ['Rslib: a re-export', 'base', `export { base } from "./chunk.js";\n`],
  // tsc keeps a comment in either list (review of 3c79e6cb74)
  [
    'tsc: a line comment in the export list',
    'base',
    `import { base } from "./chunk.js";\nexport {\n    // the builder\n    base,\n};\n`,
  ],
  [
    'tsc: a line comment in the import list',
    'base',
    `import { base // the builder\n} from "./chunk.js";\nexport { base };\n`,
  ],
]

describe.each(startBundlers)('%s build', (bundler: StartBundler) => {
  test.each(forms)(
    'a package that does not declare Start, entry form %s: the app handler leaves the client',
    async (_form, exported, entry) => {
      const lib = installPackage('npm', {
        name: 'bundled-lib',
        declaration: 'none',
        files: { 'index.js': entry, 'chunk.js': chunk(exported) },
      })
      const build = await buildStart({
        bundler,
        files: {
          ...lib.files,
          'src/fns.ts': `import { base } from 'bundled-lib'\nexport const fn = base.handler(async () => 'MARK_HANDLER_BODY')\n`,
          'src/entry.ts': `export { fn } from './fns'\n`,
          'src/ssr-entry.ts': `export { fn } from './fns'\n${callByIdExports}`,
        },
        packageJson: appManifest([lib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
      expect(build.ssr.where('MARK_HANDLER_BODY')).not.toBe('nowhere')
    },
    timeout,
  )

  // The builder made by a package that declares Start, forwarded by one
  // that does not: no module of the forwarding package uses Start, so no
  // warning would tell the user. A comment in the list (Astra's probe of
  // 3c79e6cb74) changes nothing.
  test.each([
    [
      'an import and an export list',
      `import { base } from 'auth-lib'\nexport { base }\n`,
    ],
    ['a star re-export', `export * from 'auth-lib'\n`],
    [
      'a block comment in the export list',
      `import { base } from 'auth-lib'\nexport { /* public */ base }\n`,
    ],
  ])(
    'a package that does not declare Start forwarding the builder of one that does, by %s: the app handler leaves the client',
    async (_form, forward) => {
      const auth = installPackage('npm', {
        name: 'auth-lib',
        declaration: 'peer',
        files: {
          'base.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn({ method: 'POST' })\n`,
          'index.js': `export { base } from './base.js'\n`,
        },
      })
      const kit = installPackage('npm', {
        name: 'ui-kit',
        declaration: 'none',
        files: {
          'index.js': forward,
        },
      })
      const build = await buildStart({
        bundler,
        files: {
          ...auth.files,
          ...kit.files,
          'src/fns.ts': `import { base } from 'ui-kit'\nexport const fn = base.handler(async () => 'MARK_HANDLER_BODY')\n`,
          'src/entry.ts': `export { fn } from './fns'\n`,
          'src/ssr-entry.ts': `export { fn } from './fns'\n${callByIdExports}`,
        },
        packageJson: appManifest([auth, kit]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
      expect(build.ssr.where('MARK_HANDLER_BODY')).not.toBe('nowhere')
    },
    timeout,
  )
})

// A barrel a Vite plugin serves under a package's path, as a virtual module
// without an extension: read as JavaScript, as its summary is (Astra's
// re-check of bbf72df181, P1: the check took the language from the path
// alone and left it unread). The app's isomorphic function built on the
// forwarded builder keeps only each environment's implementation.
describe('vite build', () => {
  test(
    'a package that does not declare Start, a virtual barrel without an extension re-exporting its builder: each environment keeps its own implementation',
    async () => {
      const lib = installPackage('npm', {
        name: 'iso-lib',
        declaration: 'none',
        files: {
          'impl.js': `import { createIsomorphicFn } from '@tanstack/react-start'\nexport const iso = createIsomorphicFn()\n`,
        },
      })
      let root = ''
      const barrel: Plugin = {
        name: 'test-virtual-barrel',
        configResolved(config) {
          root = config.root
        },
        resolveId(id) {
          return id === 'iso-lib/barrel'
            ? `\0${path.join(root, lib.directory, 'barrel')}`
            : null
        },
        load(id) {
          return id === `\0${path.join(root, lib.directory, 'barrel')}`
            ? `export { iso } from ${JSON.stringify(path.join(root, lib.directory, 'impl.js'))}\n`
            : null
        },
      }
      const build = await buildStart({
        bundler: 'vite',
        files: {
          ...lib.files,
          'src/label.ts': `import { iso } from 'iso-lib/barrel'\nexport const label = iso.client(() => 'MARK_LABEL_CLIENT').server(() => 'MARK_LABEL_SERVER')\n`,
          'entry.ts': `export { label } from './src/label'\n`,
        },
        packageJson: appManifest([lib]),
        viteConfig: { plugins: [barrel] },
      })
      expect(build.client.where('MARK_LABEL_CLIENT')).not.toBe('nowhere')
      expect(build.client.where('MARK_LABEL_SERVER')).toBe('nowhere')
      expect(build.ssr.where('MARK_LABEL_CLIENT')).toBe('nowhere')
      expect(build.ssr.where('MARK_LABEL_SERVER')).not.toBe('nowhere')
    },
    timeout,
  )
})
