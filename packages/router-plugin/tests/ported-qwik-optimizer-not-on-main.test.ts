/**
 * Edge cases ported from the Qwik optimizer test suite
 * (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT) that the Yuku
 * compiler handles and the Babel compiler did not. Each test names the Qwik
 * test it is ported from.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getModuleErrors } from './validate-module'

const filename = 'route.tsx'

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const groupings = defaultCodeSplitGroupings
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: groupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
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
  return { modules, sharedBindings }
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

const stubsKey = '__portedQwikRouteStubs'
let evaluations = 0

/**
 * Evaluates a split component chunk like a bundler would and renders its
 * component: JSX becomes plain calls (intrinsic elements render as tags,
 * components are called) and named imports are linked to `stubs`.
 */
async function renderSplitComponent(
  chunk: string,
  stubs: Record<string, Record<string, unknown>> = {},
) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const key = `${stubsKey}${evaluations++}`
  ;(globalThis as Record<string, unknown>)[key] = stubs
  // Imports are hoisted: link them before any other statement runs.
  const imports: Array<string> = []
  const body = code.replace(
    /^import\s+\{([^}]*)\}\s+from\s+(["'])(.+?)\2;?$/gm,
    (_, named: string, __, source: string) => {
      if (!(source in stubs)) {
        throw new Error(`no stub for import ${source}`)
      }
      imports.push(
        `const { ${named.replace(/\bas\b/g, ':')} } = globalThis.${key}[${JSON.stringify(source)}];`,
      )
      return ''
    },
  )
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, unknown> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`${runtime}${imports.join('\n')}\n${body}`)}`
  )
  return (module.component as () => string)()
}

describe('route code splitting fixed by the Yuku compiler (ported from the Qwik optimizer)', () => {
  // Qwik: example_ts_enums (TypeScript namespaces)
  it('keeps the body of a namespace used by the split component', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
namespace Labels { export const quiet = 'quiet' }
export const Route = createFileRoute('/')({
  component: () => <p>{Labels.quiet}</p>,
})
`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    expect(await renderSplitComponent(modules['virtual component']!)).toBe(
      '<p>quiet</p>',
    )
  })
})
