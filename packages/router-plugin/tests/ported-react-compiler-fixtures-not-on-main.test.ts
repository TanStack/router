import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import type { CodeSplitCompilerPlugin } from '../src/core/code-splitter/plugins'

// Inputs adapted from the React Compiler fixture corpus
// (facebook/react, compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT).

const filename = 'route.tsx'

/**
 * Parses generated code as a browser would after TypeScript erasure, with
 * semantic checks (undeclared exports, duplicate bindings, syntax errors).
 */
async function getModuleErrors(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: 'preserve',
    typescript: { onlyRemoveTypeImports: true },
  })
  const { errors } = parseSync('module.jsx', javascript, {
    sourceType: 'module',
    showSemanticErrors: true,
  })
  return errors.map((error) => error.message)
}

function declarationOf(name: string): RegExp {
  return new RegExp(String.raw`\b(?:const|let|var|function|class)\s+${name}\b`)
}

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(
  code: string,
  virtualCompilerPlugins?: Array<CodeSplitCompilerPlugin>,
) {
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
      compilerPlugins: virtualCompilerPlugins,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return modules
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

describe('split components that other exports still reference', () => {
  it.each([
    {
      // FIXTURE_ENTRYPOINT in complex-while.js and most fixtures
      name: 'an exported object',
      exports: 'export const meta = { fn: Page, params: [{}] }',
    },
    {
      // gating/gating-use-before-decl.js
      name: 'an exported call',
      exports: 'export default memo(Page)',
    },
    {
      // uid-collision-across-functions.js
      name: 'an export list',
      exports: 'export { Page, Fallback }',
    },
  ])(
    'the reference module keeps the component referenced by $name',
    async ({ exports }) => {
      const modules =
        compileRouteModules(`import { createFileRoute } from '@tanstack/react-router'
import { memo } from 'react'
function Page() {
  return <div>page</div>
}
function Fallback() {
  return <div>error</div>
}
${exports}
export const Route = createFileRoute('/')({ component: Page, errorComponent: Fallback })
`)
      expect(modules.reference).toMatch(declarationOf('Page'))
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    },
  )

  // gating/gating-test-export-default-function.js
  it('compiles a default-exported component that another split component renders', async () => {
    const modules =
      compileRouteModules(`import { createFileRoute } from '@tanstack/react-router'
export default function Bar(props) {
  return <div>{props.bar}</div>
}
function NoForget(props) {
  return <Bar>{props.noForget}</Bar>
}
export const Route = createFileRoute('/')({ component: Bar, errorComponent: NoForget })
`)
    expect(modules['virtual errorComponent']).toMatch(/\bBar\b/)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

// simple-alias.js: a lowercase component that the loader also uses
it('React HMR declares the stable split component when it is shared with the loader', async () => {
  const plugins = getFrameworkHmrCompilerPlugins({
    targetFramework: 'react',
    hmrStyle: 'vite',
  })!.filter((plugin) => plugin.onVirtualRouteSplitNode)
  const modules = compileRouteModules(
    `import { createFileRoute } from '@tanstack/react-router'
function page() {
  return <div>hello</div>
}
function load() {
  return page.name
}
export const Route = createFileRoute('/')({ component: page, loader: load })
`,
    plugins,
  )
  expect(modules.shared).toBeDefined()
  expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
})
