/**
 * The apps of the node-only-imports tests (node-only-imports-build.test.ts,
 * node-only-imports-dev.test.ts): an app module importing a package the
 * client cannot resolve (`node-only-pkg` has only a `node` export: Vite's
 * resolver throws, Rspack's fails). Import protection reads such an import
 * as one it couldn't resolve: no file rule judges it, a specifier rule does,
 * and the bundler decides on the import (it fails if it keeps it; nothing
 * ships if it drops it).
 */
import { loadMarker } from '@tanstack/compiler-test-utils/importers'

/** Text of the package's code. */
export const nodeOnlyMark = 'MARK_NODE_ONLY'

export const nodeOnlyPackage = {
  'node_modules/node-only-pkg/package.json': JSON.stringify({
    name: 'node-only-pkg',
    version: '1.0.0',
    type: 'module',
    exports: { node: './i.js' },
  }),
  'node_modules/node-only-pkg/i.js': `${loadMarker('node-only-pkg')}export const readSecret = () => '${nodeOnlyMark} secret'
export const version = '${nodeOnlyMark} version'
`,
}

const serverFn = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * The handler reads one binding; the other is a type the client keeps only
 * in a signature. What the client keeps of the import is type-only: the
 * TypeScript transform erases it.
 */
export const typeRemainder = `${serverFn}import { readSecret, Config } from 'node-only-pkg'
export const getSecret = createServerFn().handler(() => readSecret())
export function show(c: Config) {
  return typeof c
}
`

/** Client code reads the import: the client keeps it whole. */
export const keptWhole = `import { readSecret } from 'node-only-pkg'
export const show = () => readSecret()
`

/** The handler reads one binding, client code the other. */
export const valueRemainder = `${serverFn}import { readSecret, version } from 'node-only-pkg'
export const getSecret = createServerFn().handler(() => readSecret())
export const show = () => version
`

/** Import protection denying the package by specifier on the client. */
export const deniedPackage = { client: { specifiers: ['node-only-pkg'] } }
