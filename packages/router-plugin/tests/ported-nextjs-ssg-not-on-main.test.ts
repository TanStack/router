/**
 * Scenarios ported from Next.js's SSG transform fixtures
 * (vercel/next.js `crates/next-custom-transforms/tests/fixture/ssg`, MIT)
 * that the Babel-based code splitter on `main` gets wrong and the Yuku-based
 * compiler handles. A split route option plays the removed
 * `getStaticProps`, the reference module plays the page that keeps the rest.
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
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'
import type { CodeSplitGroupings } from '../src/core/constants'

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
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
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

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  groupings: CodeSplitGroupings
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-nextjs-ssg-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
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
            defaultBehavior: options.groupings,
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

const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

describe('ported Next.js SSG fixtures: class and exported components', () => {
  // Source: ssg/getStaticProps/should-support-class-exports
  it('splits a class component with its dependencies', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
import { format } from './format'
class Page extends React.Component {
  static title = format('home')
  render() {
    return <div>{Page.title}</div>
  }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`)
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(modules.reference).not.toContain('./format')
    expect(modules['virtual component']).toMatch(declarationOf('Page'))
    expect(modules['virtual component']).toContain('./format')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: ssg/getStaticProps/should-not-crash-for-class-declarations
  it('keeps the export of an exported class component', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
export class Page extends React.Component {
  render() {
    return <div>page</div>
  }
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(modules.reference).toMatch(/export class Page\b/)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: ssg/getStaticProps/should-remove-re-exported-function-declarations,
  // should-support-named-export-as-default and
  // should-support-export-named-as-default-with-a-class
  it.each([
    {
      name: 'export { Page }',
      code: `function Page() {
  return <div>page</div>
}
export { Page }`,
    },
    {
      name: 'export { Page as default }',
      code: `function Page() {
  return <div>page</div>
}
export { Page as default }`,
    },
    {
      name: 'export { Page as default, a } with a class',
      code: `import * as React from 'react'
class Page extends React.Component {
  render() {
    return <div>page</div>
  }
}
const a = 5
export { Page as default, a }`,
    },
    {
      name: 'export { Page as Renamed, kept as keptRenamed }',
      code: `const Page = () => <div>page</div>
const kept = () => 'kept'
export { Page as Renamed, kept as keptRenamed }`,
    },
  ])(
    'keeps a component exported through $name declared in the reference module',
    async ({ code }) => {
      const { modules } = compileRouteModules(`${head}${code}
export const Route = createFileRoute('/')({ component: Page })
`)
      expect(modules.reference).toMatch(declarationOf('Page'))
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    },
  )
})

describe('ported Next.js SSG fixtures: exports read by split chunks', () => {
  // Source: ssg/getStaticProps/should-not-crash-for-class-declarations
  it('imports an exported class and a re-exported function instead of copying them', async () => {
    const { modules } = compileRouteModules(`${head}function getPaths() {
  return []
}
export { getPaths }
export class MyClass {}
function Page() {
  return <div>{getPaths().length}{String(new MyClass())}</div>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    const component = modules['virtual component']!
    // A copied class would break `instanceof MyClass` checks across modules
    expect(component).not.toMatch(declarationOf('MyClass'))
    expect(component).not.toMatch(declarationOf('getPaths'))
    expect(component).toMatch(
      /import \{[^}]*\bgetPaths\b[^}]*\} from ['"]route\.tsx['"]/,
    )
    expect(component).toMatch(
      /import \{[^}]*\bMyClass\b[^}]*\} from ['"]route\.tsx['"]/,
    )
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: ssg/getStaticProps/should-support-export-named-as-default-with-other-specifiers
  it.each([
    {
      name: 'export { store as appStore }',
      exports: 'export { store as appStore }',
      read: 'entry.appStore',
      entryExtra: '',
    },
    {
      name: 'export default store',
      exports: 'export default store',
      read: 'entry.default',
      entryExtra: `export { default } from './routes/index'\n`,
    },
  ])(
    'shares one store exported as $name with the split component',
    async ({ exports, read, entryExtra }) => {
      const result = await buildAndRun({
        groupings: defaultCodeSplitGroupings,
        files: {
          'store.ts': `export function createStore() {
  ;(globalThis as any).stores = ((globalThis as any).stores ?? 0) + 1
  return { count: 0 }
}`,
          'routes/index.tsx': `${head}import { createStore } from '../store'
const store = createStore()
${exports}
export const Route = createFileRoute('/')({
  component: () => <p>{store.count}</p>,
})`,
          'entry.ts': `${renderEntry}${entryExtra}`,
        },
        script: `${read}.count = 5
const html = await entry.render(entry.Route.options.component)
return [html, globalThis.stores]`,
      })
      expect(result).toEqual(['<p>5</p>', 1])
    },
    30_000,
  )

  // Source: ssg/getStaticProps/should-remove-extra-named-export-speicifers,
  // should-support-full-re-export and should-support-class-exports
  it('does not copy the route module re-exports and default class into split chunks', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
export { getPaths, a as getProps } from './lib'
export { foo, bar as baz } from './lib'
export { helper } from './default-lib'
export default class Test extends React.Component {
  render() {
    return <div>test</div>
  }
}
export const Route = createFileRoute('/')({
  component: () => <div>home</div>,
})
`)
    expect(modules.reference).toMatch(
      /export \{ getPaths, a as getProps \} from ['"]\.\/lib['"]/,
    )
    expect(modules.reference).toMatch(/export default class Test\b/)
    for (const name of [
      'virtual component',
      'virtual errorComponent',
      'virtual notFoundComponent',
    ]) {
      expect(modules[name]).not.toContain('./lib')
      expect(modules[name]).not.toContain('./default-lib')
      expect(modules[name]).not.toContain('class Test')
    }
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: ssg/getStaticProps/should-not-remove-import-used-in-render
  it('shares a binding the loader reads and the component renders as a JSX member tag', async () => {
    const result = await buildAndRun({
      groupings: defaultCodeSplitGroupings,
      files: {
        'ui.tsx': `export function createUi() {
  ;(globalThis as any).uis = ((globalThis as any).uis ?? 0) + 1
  return { Box: () => <p>box</p> }
}`,
        'routes/index.tsx': `${head}import { createUi } from '../ui'
const ui = createUi()
export const Route = createFileRoute('/')({
  loader: () => typeof ui.Box,
  component: () => <ui.Box />,
})`,
        'entry.ts': renderEntry,
      },
      script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.uis]`,
    })
    expect(result).toEqual(['<p>box</p>', 1])
  }, 30_000)
})
