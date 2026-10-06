import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import { compileRouteModules } from './regression-helpers'

/** The module record a bundler sees once TypeScript is erased. */
async function runtimeModuleInfo(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: 'preserve',
    typescript: { onlyRemoveTypeImports: true },
  })
  return parseSync('module.jsx', javascript, { sourceType: 'module' }).module
}

/**
 * Every value a module imports from the shared module must be exported by the
 * shared module at runtime; otherwise bundlers fail with a missing export and
 * browsers refuse to link the module.
 */
async function missingSharedImports(modules: Record<string, string>) {
  const sharedExports = new Set<string>()
  if (modules.shared) {
    for (const entry of (await runtimeModuleInfo(modules.shared))
      .staticExports) {
      for (const item of entry.entries) {
        if (item.exportName.name) {
          sharedExports.add(item.exportName.name)
        }
      }
    }
  }
  const missing: Array<string> = []
  for (const [name, code] of Object.entries(modules)) {
    if (name === 'shared') {
      continue
    }
    for (const declaration of (await runtimeModuleInfo(code)).staticImports) {
      if (!declaration.moduleRequest.value.includes('tsr-shared')) {
        continue
      }
      for (const entry of declaration.entries) {
        const imported = entry.importName.name ?? 'default'
        if (!entry.isType && !sharedExports.has(imported)) {
          missing.push(`${name} imports ${imported}`)
        }
      }
    }
  }
  return missing
}

// Ambient declarations (`declare ...`) have no runtime binding: the value is
// provided by the environment (a <script> tag, a bundler define, a global).
describe('code-splitter ambient declarations used by split and unsplit options', () => {
  it.each([
    [
      'declare function',
      'declare function track(event: string): void',
      'track("x")',
    ],
    [
      'exported declare function',
      'export declare function track(event: string): void',
      'track("x")',
    ],
    ['declare enum', 'declare enum Flags { On = 1 }', 'Flags.On'],
    [
      'declare namespace',
      'declare namespace Analytics { function track(event: string): void }',
      'Analytics.track("x")',
    ],
    [
      'declare module (namespace form)',
      'declare module Analytics { function track(event: string): void }',
      'Analytics.track("x")',
    ],
  ])(
    'does not import a %s from the shared module',
    async (_, declaration, use) => {
      const code = `import { createFileRoute } from '@tanstack/react-router'
${declaration}
export const Route = createFileRoute('/ambient')({
  loader: () => ${use},
  component: () => <button onClick={() => ${use}}>track</button>,
})
`
      const { modules } = compileRouteModules(code)
      expect(await missingSharedImports(modules)).toEqual([])
    },
  )
})
