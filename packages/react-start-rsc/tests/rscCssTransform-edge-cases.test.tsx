import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../start-plugin-core/src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../start-plugin-core/src/start-compiler/config'
import { createRscCssCompilerTransforms } from '../src/plugin/rscCssTransform'

async function compileWithRscCssTransform(code: string) {
  const compilerTransforms = createRscCssCompilerTransforms({
    loadCssExpression: 'import.meta.viteRsc.loadCss()',
  })
  const compiler = new StartCompiler({
    env: 'server',
    envName: 'rsc',
    root: '/test',
    framework: 'react',
    providerEnvName: 'rsc',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv('server', { compilerTransforms }),
    lookupConfigurations: getLookupConfigurationsForEnv('server', 'react', {
      compilerTransforms,
    }),
    compilerTransforms,
    getKnownServerFns: () => ({}),
    loadModule: async () => {},
    resolveId: async (id) => id,
  })
  const result = await compiler.compile({
    id: '/test/src/route.tsx',
    code,
    detectedKinds: detectKindsInCode(code, 'server', { compilerTransforms }),
  })
  return result?.code ?? null
}

/** Erase TypeScript and parse the output as a JavaScript module. */
async function getModuleErrors(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: 'preserve',
    typescript: { onlyRemoveTypeImports: true },
  })
  return parseSync('module.jsx', javascript, {
    sourceType: 'module',
    showSemanticErrors: true,
  }).errors.map((error) => error.message)
}

const optionsCount = (code: string) =>
  code.match(/__tanstackStartRscCss:\s*import\.meta\.viteRsc\.loadCss\(\)/g)
    ?.length ?? 0
const fragmentCount = (code: string) =>
  code.match(/<>\{import\.meta\.viteRsc\.loadCss\(\)\}/g)?.length ?? 0

describe('RSC CSS compiler transforms: import and argument shapes', () => {
  test('aliased, namespace and @tanstack/react-start-rsc imports are rewritten', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderServerComponent as render, renderToReadableStream as toStream } from '@tanstack/react-start/rsc'
      import * as RSC from '@tanstack/react-start/rsc'
      import { createCompositeComponent } from '@tanstack/react-start-rsc'

      export const a = render(<Card />)
      export const b = RSC.renderServerComponent(<Card />)
      export const c = createCompositeComponent(() => ({ Card: <Card /> }))
      export const d = toStream(<Card />)
      export const e = RSC.renderToReadableStream(<><Card /></>)
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(optionsCount(code!)).toBe(3)
    expect(fragmentCount(code!)).toBe(2)
  })

  test('renderToReadableStream unwraps transparent wrappers around JSX only', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderToReadableStream } from '@tanstack/react-start/rsc'

      const element = <Card />
      export const wrapped = [
        renderToReadableStream((<Card />)),
        renderToReadableStream(<Card /> as any),
        renderToReadableStream(<Card />!),
        renderToReadableStream((<><Card /></>) satisfies unknown),
      ]
      export const untouched = [
        renderToReadableStream(element),
        renderToReadableStream(flag ? <A /> : <B />),
        renderToReadableStream(...args),
      ]
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(fragmentCount(code!)).toBe(4)
    expect(code).toContain('renderToReadableStream(element)')
    expect(code).toContain('renderToReadableStream(...args)')
    expect(code).not.toMatch(/as any|satisfies unknown|\/>!/)
  })

  test('calls with extra arguments and shadowed names are left alone', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderServerComponent } from '@tanstack/react-start/rsc'

      export const configured = renderServerComponent(<Card />, { existing: true })
      export function local(renderServerComponent) {
        return renderServerComponent(<Card />)
      }
      export const transformed = renderServerComponent(<Card />)
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(optionsCount(code!)).toBe(1)
    // Existing options are not followed by a second options object.
    expect(code).toMatch(/existing: true\s*\}\)/)
  })
})
