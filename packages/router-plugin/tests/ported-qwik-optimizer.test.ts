/**
 * Known compiler bugs found by porting edge cases from the Qwik optimizer test
 * suite (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT), pinned as
 * expected failures. Each test names the Qwik test it is ported from.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
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

/**
 * How many times `pattern` occurs across the modules a bundle loads: the
 * reference module, the split chunks it imports and the shared module.
 */
function countAcrossModules(modules: Record<string, string>, pattern: RegExp) {
  const reference = modules.reference!
  return Object.entries(modules)
    .filter(
      ([name]) =>
        !name.startsWith('virtual ') ||
        reference.includes(`tsr-split=${name.slice('virtual '.length)}`),
    )
    .reduce(
      (count, [, code]) =>
        count + (code.match(new RegExp(pattern.source, 'g'))?.length ?? 0),
      0,
    )
}

describe('known route code splitting bugs (ported from the Qwik optimizer)', () => {
  // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
  // Bug: a non-exported module-level binding used by both the reference module
  // (here an exported provider) and a split component is copied into the split
  // chunk instead of being shared, because it is never reassigned. Impact: the
  // chunk creates its own context, so the split component ignores
  // `<ThemeProvider>` and renders the default value. Remove `.fails` once
  // fixed.
  it.fails(
    'creates a private context shared by a provider and the split component once',
    async () => {
      const { modules } = compileRouteModules(`
import { createContext, useContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const Theme = createContext('light')
export function ThemeProvider({ children }) {
  return <Theme.Provider value="dark">{children}</Theme.Provider>
}
export const Route = createFileRoute('/')({
  component: () => <p>{useContext(Theme)}</p>,
})
`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
      expect(countAcrossModules(modules, /createContext\(/)).toBe(1)
    },
  )
})
