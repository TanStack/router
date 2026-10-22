/**
 * Validity of a module the internal Start compiler emitted, for the legacy
 * helpers only (`diagnostics.ts`, `render.ts`, `regression-helpers.ts`:
 * the implementation tests and the tests held by pending rulings Q6/Q7).
 * Moved out of `@tanstack/compiler-test-utils` (it was its
 * `validate-module`); delete it with its callers.
 *
 * Dead code may dangle (SPEC G8): a name the module reads free counts only
 * if Rolldown (Vite's production bundler) keeps the read when it bundles
 * the module alone, its exports kept and every import external.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'
import { readNames } from '@tanstack/compiler-test-utils/free-names'
import { knownGlobals } from '@tanstack/compiler-test-utils/known-globals'
import type { Rolldown } from 'vite'

/**
 * The errors of a compiled module (TypeScript erased, every value import
 * kept, JSX compiled for React's automatic runtime): what the parser
 * rejects, and the names it reads free that are no global of the browser
 * or Node.js and that `source` (the module it was compiled from) does not
 * read free itself, in code Rolldown keeps.
 *
 * @returns the error messages; an empty array means the module is valid.
 */
export async function getModuleErrors(
  code: string,
  filename = 'module.tsx',
  options: { source?: string } = {},
): Promise<Array<string>> {
  let compiled: string
  try {
    compiled = await compileModule(code, filename)
  } catch (error) {
    return [stripVTControlCharacters((error as Error).message)]
  }
  const read = readNames(compiled)
  if (read.errors.length > 0) {
    return read.errors
  }
  const allowed = new Set(knownGlobals)
  if (options.source !== undefined) {
    const source = readNames(await compileModule(options.source, filename))
    source.free.forEach((name) => allowed.add(name))
  }
  let names = [...read.free].filter((name) => !allowed.has(name))
  if (names.length > 0) {
    const kept = readNames(await treeShake(compiled)).free
    names = names.filter((name) => kept.has(name))
  }
  return names.map(
    (name) => `\`${name}\` is referenced but never declared or imported`,
  )
}

/** The module with TypeScript erased and JSX compiled by Oxc (React's automatic runtime). */
async function compileModule(code: string, filename: string) {
  const { code: javascript } = await transformWithOxc(code, filename, {
    jsx: { runtime: 'automatic', importSource: 'react' },
    typescript: { onlyRemoveTypeImports: true },
  })
  return javascript
}

const require = createRequire(import.meta.url)
let rolldownModule: Promise<typeof Rolldown> | undefined

/** The Rolldown that Vite builds with (a dependency of Vite, not ours). */
function loadRolldown(): Promise<typeof Rolldown> {
  rolldownModule ??= import(
    pathToFileURL(createRequire(require.resolve('vite')).resolve('rolldown'))
      .href
  ) as Promise<typeof Rolldown>
  return rolldownModule
}

const entryId = '\0validate-module-entry'

/**
 * What Rolldown keeps of a JavaScript module bundled alone, tree-shaking on,
 * its exports kept: every import stays external, and external modules count
 * as side-effectful. `platform: 'neutral'` defines nothing (no
 * `process.env.NODE_ENV`), since the module may run on the client or the
 * server.
 */
async function treeShake(javascript: string): Promise<string> {
  const { rolldown } = await loadRolldown()
  const bundle = await rolldown({
    input: entryId,
    platform: 'neutral',
    treeshake: true,
    logLevel: 'silent',
    external: (id) => id !== entryId,
    plugins: [
      {
        name: 'validate-module-entry',
        resolveId: (id) => (id === entryId ? id : null),
        load: (id) => (id === entryId ? javascript : null),
      },
    ],
  })
  try {
    const { output } = await bundle.generate({ format: 'esm' })
    return output
      .map((item) => (item.type === 'chunk' ? item.code : ''))
      .join('\n')
  } finally {
    await bundle.close()
  }
}

/**
 * The modules a compiled module's dynamic `import()`s name (static
 * specifiers) that survive Rolldown bundling the module alone
 * (`treeShake`): an `import()` in code that bundler deletes (e.g. in a
 * function nothing calls) is no load; one in code it keeps is.
 */
export async function keptDynamicImports(
  code: string,
  options: { filename?: string } = {},
): Promise<Array<string>> {
  const compiled = await compileModule(code, options.filename ?? 'module.tsx')
  // Rolldown rewrites relative external specifiers: each static one becomes
  // a bare placeholder it keeps as is, named back afterwards.
  const targets: Array<string> = []
  const marked = replaceStaticDynamicImports(compiled, (specifier) => {
    targets.push(specifier)
    return JSON.stringify(`${keptPlaceholder}${targets.length - 1}`)
  })
  const kept = new Set<string>()
  replaceStaticDynamicImports(await treeShake(marked), (specifier) => {
    if (specifier.startsWith(keptPlaceholder)) {
      const target = targets[Number(specifier.slice(keptPlaceholder.length))]
      if (target !== undefined) {
        kept.add(target)
      }
    }
    return undefined
  })
  return [...kept]
}

const keptPlaceholder = 'validate-module-dynamic-import:'

/**
 * Replaces each dynamic `import()` specifier of `javascript` that is a
 * string literal (or a template literal without substitutions) with the
 * code `replace` returns for its value, when it returns some.
 */
function replaceStaticDynamicImports(
  javascript: string,
  replace: (specifier: string) => string | undefined,
) {
  const { module } = parseSync('module.js', javascript, {
    sourceType: 'module',
  })
  let result = javascript
  for (const { moduleRequest } of [...module.dynamicImports].reverse()) {
    const literal = /^(["'`])([^"'`\\$]*)\1$/.exec(
      javascript.slice(moduleRequest.start, moduleRequest.end),
    )
    const replacement = literal ? replace(literal[2]!) : undefined
    if (replacement !== undefined) {
      result =
        result.slice(0, moduleRequest.start) +
        replacement +
        result.slice(moduleRequest.end)
    }
  }
  return result
}
