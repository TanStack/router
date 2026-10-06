/**
 * Known code-splitter bugs found with inputs adapted from the React Compiler
 * fixture corpus (facebook/react,
 * compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT),
 * pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'

const filename = 'route.tsx'
const groupings = [['component']] as const

/** Compiles a route file into its reference, component and shared modules. */
function compileRouteModules(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: [...groupings].map((group) => [...group]),
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  return {
    reference:
      compileCodeSplitReferenceRoute({
        code,
        filename,
        id: filename,
        addHmr: false,
        codeSplitGroupings: [...groupings].map((group) => [...group]),
        targetFramework: 'react',
        sharedBindings: shared,
      })?.code ?? code,
    component: compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=component`,
      splitTargets: ['component'],
      sharedBindings: shared,
    }).code,
    shared: shared
      ? compileCodeSplitSharedRoute({
          code,
          sharedBindings: shared,
          filename: `${filename}?tsr-shared=1`,
        }).code
      : undefined,
  }
}

const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/** Turns a module into a data URL, after replacing its import sources. */
async function toDataUrl(code: string, imports: Record<string, string>) {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const linked = javascript.replace(
    /(from\s*)(["'])([^"']+)\2/g,
    (match, from: string, _quote: string, source: string) =>
      source in imports ? `${from}${JSON.stringify(imports[source])}` : match,
  )
  return `data:text/javascript,${encodeURIComponent(runtime + linked)}`
}

const routerStub = `data:text/javascript,${encodeURIComponent(`export const createFileRoute = () => (options) => ({ options })
export const lazyRouteComponent = (importer, name) => ({ importer, name })`)}`

describe('known code-splitter bugs (React Compiler fixtures)', () => {
  // Bug: a top-level function that is reassigned at module level
  // (module-scoped-bindings.js: `function f() {}` then `f = ...`) and used by
  // both the loader and the split component is extracted to the shared module.
  // The reference module then imports it and keeps the `f = ...` statement,
  // which assigns to an import binding. Impact: the route module throws
  // "Assignment to constant variable" as soon as it is evaluated, on both
  // main and the Yuku PR. Remove `.fails` once fixed.
  test.fails(
    'a module-level reassignment of a shared function keeps the route module loadable',
    async () => {
      const modules =
        compileRouteModules(`import { createFileRoute } from '@tanstack/react-router'
function format() {
  return 'original'
}
format = () => 'reassigned'
export const Route = createFileRoute('/')({
  loader: () => format(),
  component: () => <p>{format()}</p>,
})
`)
      const shared = modules.shared
        ? await toDataUrl(modules.shared, {})
        : undefined
      const imports: Record<string, string> = {
        '@tanstack/react-router': routerStub,
        ...(shared ? { 'route.tsx?tsr-shared=1': shared } : {}),
      }
      const reference = await import(
        /* @vite-ignore */ await toDataUrl(modules.reference, imports)
      )
      expect(reference.Route.options.loader()).toBe('reassigned')
      const chunk = await import(
        /* @vite-ignore */ await toDataUrl(modules.component, imports)
      )
      expect(chunk.component()).toBe('<p>reassigned</p>')
    },
  )
})
