/**
 * Scenarios ported from babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * `src/find-referenced-identifiers.test.ts` and
 * `src/find-removable-bindings.test.ts`, MIT). The code splitter removes the
 * split route options from the reference module and everything only they
 * used; these tests check which bindings that removal prunes and which it
 * keeps.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'

const filename = 'route.tsx'
const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const runNode = promisify(execFile)

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const hmrReference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: true,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: shared,
    compilerPlugins: getFrameworkHmrCompilerPlugins({
      targetFramework: 'react',
    }),
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
    'reference with HMR': hmrReference?.code ?? code,
  }
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings: [...sharedBindings].sort() }
}

async function getErrorsByModule(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  return errors
}

function noErrors(modules: Record<string, string>) {
  return Object.fromEntries(Object.keys(modules).map((name) => [name, []]))
}

/** Import statements of `code` that load `source`. */
function importsOf(code: string, source: string) {
  return code
    .split('\n')
    .filter((line) => /^import\b/.test(line) && line.includes(`'${source}'`))
}

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-babel-dce-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(
      path.join(root, 'entry.ts'),
      `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
    )
    for (const [file, code] of Object.entries(options.files)) {
      await writeFile(path.join(root, file), code)
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: defaultCodeSplitGroupings,
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${options.script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('ported babel-dead-code-elimination: imports', () => {
  // Source: dead-code-elimination.test.ts "import" > "mixed default and named:
  // only named used" and "mixed default and named: only default used"
  it('gives the reference module and the chunk only the specifiers each one reads', async () => {
    const { modules } =
      compileRouteModules(`${head}import def, { named } from './lib'
import other, * as ns from './other'
export const Route = createFileRoute('/')({
  loader: () => [named, other],
  component: () => <p>{def}{ns.x}</p>,
})
`)
    expect(importsOf(modules.reference!, './lib')).toEqual([
      expect.stringMatching(/^import \{ named \} from/),
    ])
    expect(importsOf(modules.reference!, './other')).toEqual([
      expect.stringMatching(/^import other from/),
    ])
    const component = modules['virtual component']!
    expect(importsOf(component, './lib')).toEqual([
      expect.stringMatching(/^import def from/),
    ])
    expect(importsOf(component, './other')).toEqual([
      expect.stringMatching(/^import \* as ns from/),
    ])
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "import" > "mixed default and named:
  // none used", "namespace" and "side-effect"
  it('drops an import whose every specifier moved instead of leaving a side-effect import', async () => {
    const { modules } = compileRouteModules(`${head}import a, { b } from 'pkg'
import * as ns from 'ns-pkg'
import './styles.css'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}{ns.x}</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      expect(modules[name]).not.toMatch(/['"](?:pkg|ns-pkg)['"]/)
      // An import that never had specifiers is a side effect and stays
      expect(modules[name]).toMatch(/^import ['"]\.\/styles\.css['"]/m)
    }
    expect(importsOf(modules['virtual component']!, 'pkg')).toEqual([
      expect.stringMatching(/^import a, \{ b \} from/),
    ])
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('ported babel-dead-code-elimination: declarations', () => {
  // Source: dead-code-elimination.test.ts "only eliminates newly unreferenced
  // identifiers", "everything is unreferenced, nothing is removed",
  // "unexported circular references" and find-removable-bindings.test.ts
  // "single unreferenced binding without self-ref -> not removable by SCC"
  it('keeps declarations that nothing used before splitting in the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}function unusedFunction() { return 1 }
const unusedExpression = function () {}
const unusedArrow = () => {}
function y(): number { return x() }
function x(): number { return y() }
function selfOnly(): number { return selfOnly() }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      for (const declared of [
        'unusedFunction',
        'unusedExpression',
        'unusedArrow',
        'y',
        'x',
        'selfOnly',
      ]) {
        expect(modules[name]).toMatch(declarationOf(declared))
      }
    }
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "SCC dead code elimination" >
  // "arrow functions in mutual recursion -> removed", "mixed function types in
  // cycle -> removed" and "self-recursive function used -> preserved"
  it('moves component-only mutually recursive and self-recursive helpers out of the reference module', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep }
function self(n: number): number { return n > 0 ? self(n - 1) : 2 }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}{self(2)}</p>,
})
`)
    expect(sharedBindings).toEqual([])
    for (const name of ['reference', 'reference with HMR']) {
      for (const declared of ['ping', 'pong', 'self']) {
        expect(modules[name]).not.toMatch(declarationOf(declared))
      }
      expect(modules[name]).not.toContain('./dep')
    }
    for (const declared of ['ping', 'pong', 'self']) {
      expect(modules['virtual component']).toMatch(declarationOf(declared))
    }
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "SCC dead code elimination" > "SCC
  // with external caller used -> all preserved" and
  // find-removable-bindings.test.ts "SCC with incoming from another candidate
  // -> not removable"
  it('keeps a cycle the component reads in the reference module while an unused caller still reaches it', async () => {
    const { modules } =
      compileRouteModules(`${head}function a(): number { return b() }
function b(): number { return a() }
function c() { return a() }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{typeof a}</p>,
})
`)
    for (const declared of ['a', 'b', 'c']) {
      expect(modules.reference).toMatch(declarationOf(declared))
    }
    expect(modules['virtual component']).toMatch(declarationOf('a'))
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: find-removable-bindings.test.ts "constant violations mark as
  // external" and dead-code-elimination.test.ts "assignment"
  it('declares a binding the split component only writes in its chunk', async () => {
    const { modules } = compileRouteModules(`${head}let lastRender = 0
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    lastRender = Date.now()
    return <p>component</p>
  },
})
`)
    expect(modules['virtual component']).toMatch(/let lastRender = 0/)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('ported babel-dead-code-elimination: patterns', () => {
  // Source: dead-code-elimination.test.ts "object pattern" > "within
  // assignment pattern" and "array pattern" > "within object property"
  it('shares a nested destructuring with default values whose bindings the loader and the component split', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { x } from './x'
let { a: { aa, bb } = { aa: 1, bb: 2 }, c: [c0, c1] = [] } = x
export const Route = createFileRoute('/')({
  loader: () => [bb, c1],
  component: () => <p>{aa}{c0}</p>,
})
`)
    expect(sharedBindings).toEqual(['aa', 'bb', 'c0', 'c1'])
    expect(modules.shared).toMatch(/aa: 1,\s*bb: 2/)
    expect(modules.shared).toMatch(/c: \[c0, c1\] = \[\]/)
    for (const name of ['reference', 'virtual component']) {
      expect(modules[name]).not.toContain('./x')
    }
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "object pattern" > "within function
  // param" (function declaration, function expression, object method, arrow,
  // class method and class private method)
  it('keeps empty destructuring parameters of helpers moved into the chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}function f(a: any, {}: any) { return a }
const g = (a: any, []: any) => a
const o = { m(a: any, {}: any) { return a } }
class K {
  m(a: any, {}: any) { return a }
  #p(a: any, {}: any) { return a }
  q(a: any) { return this.#p(a, {}) }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{f(1, {})}{g(2, [])}{o.m(3, {})}{new K().q(4)}</p>,
})
`)
    const component = modules['virtual component']!
    expect(component).toContain('function f(a: any, {}: any)')
    expect(component).toContain('const g = (a: any, []: any) => a')
    expect(component).toContain('m(a: any, {}: any)')
    expect(component).toContain('#p(a: any, {}: any)')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('ported babel-dead-code-elimination: var declarations nested in statements', () => {
  // Source: dead-code-elimination.test.ts "variable" > "within for...in" and
  // "within for...of" (var bindings declared inside nested statements).
  // Main removes the var declarators that only the split component reads from
  // the reference module, so their initializers run once, in the chunk.
  it('moves component-only vars declared in top-level blocks out of the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}import { compute, connect } from './lib'
if (typeof window !== 'undefined') {
  var flag = compute()
}
try {
  var conn = connect()
} catch {}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(flag)}{String(conn)}</p>,
})
`)
    for (const name of ['reference', 'reference with HMR']) {
      expect(modules[name]).not.toContain('compute()')
      expect(modules[name]).not.toContain('connect()')
      expect(modules[name]).not.toContain('./lib')
    }
    expect(modules['virtual component']).toContain('var flag = compute()')
    expect(modules['virtual component']).toContain('var conn = connect()')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "variable" > "within for...in"
  it('keeps a loader-only var declared in a top-level block out of the component chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}import { compute } from './lib'
{
  var block = compute()
}
export const Route = createFileRoute('/')({
  loader: () => block,
  component: () => <p>component</p>,
})
`)
    expect(modules.reference).toContain('var block = compute()')
    expect(modules['virtual component']).not.toContain('compute()')
    expect(modules['virtual component']).not.toContain('./lib')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: dead-code-elimination.test.ts "variable" > "within for...in"
  it('runs the initializer of a component-only var declared in a top-level block once', async () => {
    const result = await buildAndRun({
      files: {
        'counter.ts': `export function compute() {
  ;(globalThis as any).computeCalls = ((globalThis as any).computeCalls ?? 0) + 1
  return 'computed'
}`,
        'routes/index.tsx': `${head}import { compute } from '../counter'
if (typeof globalThis === 'object') {
  var flag = compute()
}
export const Route = createFileRoute('/')({
  component: () => <p>{flag}</p>,
})`,
      },
      script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.computeCalls]`,
    })
    expect(result).toEqual(['<p>computed</p>', 1])
  }, 30_000)
})
