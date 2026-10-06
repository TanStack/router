/**
 * Known RSC CSS compiler-transform bugs, pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * transform does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
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

// Bug: when the JSX argument of `renderToReadableStream` is preceded by a
// comment, the comment is moved inside the generated CSS fragment, where it
// becomes JSX text. Impact: the comment is rendered into the RSC payload as
// visible text. Remove `.fails` once fixed.
test.fails.each([
  {
    name: 'a block comment',
    argument: `/* the card */ <Card />`,
  },
  {
    name: 'a line comment',
    argument: `
  // the card
  <Card />,
`,
  },
])(
  'renderToReadableStream does not render $name before the JSX argument',
  async ({ argument }) => {
    const code = await compileWithRscCssTransform(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(${argument})
`)
    expect(code).toContain('loadCss()')
    // Compile JSX to calls: rendered text becomes string literal children.
    const { code: javascript } = await transformWithOxc(code!, 'route.tsx', {
      jsx: { runtime: 'classic' },
    })
    expect(javascript).not.toMatch(/(["'])[^"'\n]*the card[^"'\n]*\1/)
  },
)

// Bug: for `renderServerComponent(...args)` / `createCompositeComponent(...args)`
// the CSS options object is appended after the spread, so its position
// depends on how many values the spread holds: with `[element, options]` it
// becomes an ignored third argument. Impact: the component's CSS is not
// attached. Remove `.fails` once fixed.
test.fails.each(['renderServerComponent', 'createCompositeComponent'])(
  '%s does not append CSS options after a spread argument',
  async (name) => {
    const code = await compileWithRscCssTransform(`
import { ${name} } from '@tanstack/react-start/rsc'
const args = [<Card />, { extra: true }] as const
export const value = ${name}(...args)
`)
    expect(code ?? '').not.toMatch(/\.\.\.args,\s*\{/)
  },
)
