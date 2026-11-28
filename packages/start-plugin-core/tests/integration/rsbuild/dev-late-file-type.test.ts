/**
 * Start's check of the file types the late pass does not read
 * (`rsbuild/late-pass.ts`) on Rsbuild's dev server, which keeps the modules
 * an edit does not touch, with two modules of one file (a loader's
 * request): a module that left the graph takes its error with it, though
 * the other module stays; a rebuild of the clean module leaves the other's
 * error (the build rows: `../start-build-late-pass.test.ts`, "rsbuild
 * build, a module of a file type the late pass does not read").
 * Source: review of the fail-closed check (Astra: the error stayed against
 * the clean module; Gemini: the clean module withdrew the other's error).
 */
import { expect, test } from 'vitest'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

const fooRule = {
  tools: {
    rspack: {
      module: { rules: [{ test: /\.foo$/, type: 'javascript/auto' }] },
    },
  },
}

/** A loader replacing its file with a module that uses no Start, reading `src/clean-dep.txt`. */
const cleanLoader = `const path = require('node:path')
module.exports = function () {
  this.addDependency(path.join(this.rootContext, 'src/clean-dep.txt'))
  return "export default 'MARK_CLEAN'"
}
`

/** A loader replacing its file with a module that uses Start. */
const startLoader = `module.exports = function () {
  return ${JSON.stringify(`import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_FOO_HANDLER')
`)}
}
`

test('Rsbuild dev: an edit that drops the failing module of a file clears its error', async () => {
  const server = await startRsbuildStartDevServer({
    config: fooRule,
    files: {
      'src/page.foo': `export default 'MARK_CLEAN'\n`,
      'src/start-loader.cjs': startLoader,
      'src/entry.ts': `// @ts-expect-error (a module of an app rule)
export { default as clean } from './page.foo'
// @ts-expect-error (a loader's module)
export { fn } from '!!./start-loader.cjs!./page.foo'
`,
    },
  })
  expect(server.errors.join('\n')).toContain('src/page.foo')
  await server.edit({
    'src/entry.ts': `// @ts-expect-error (a module of an app rule)
export { default as clean } from './page.foo'
`,
  })
  expect(server.errors).toEqual([])
})

test('Rsbuild dev: a rebuild of the clean module of a file keeps the other module’s error', async () => {
  const server = await startRsbuildStartDevServer({
    config: fooRule,
    files: {
      'src/page.foo': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_FOO_HANDLER')
`,
      'src/clean-loader.cjs': cleanLoader,
      'src/clean-dep.txt': 'one\n',
      'src/entry.ts': `// @ts-expect-error (a module of an app rule)
export { fn } from './page.foo'
// @ts-expect-error (a loader's module)
export { default as clean } from '!!./clean-loader.cjs!./page.foo'
`,
    },
  })
  // (only the clean module reads it)
  await server.edit({ 'src/clean-dep.txt': 'two\n' })
  expect(server.rebuilt).not.toContain('src/entry.ts')
  expect(server.errors.join('\n')).toContain('src/page.foo')
})
