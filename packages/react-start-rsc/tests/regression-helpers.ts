/**
 * Helpers shared by the RSC CSS transform regression suites: compile a module
 * through the Start compiler with the RSC CSS compiler transforms, the way the
 * `rsc` environment does.
 */
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../start-plugin-core/src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../start-plugin-core/src/start-compiler/config'
import { createRscCssCompilerTransforms } from '../src/plugin/rscCssTransform'

export { getModuleErrors } from '../../start-plugin-core/tests/validate-module'

export async function compileWithRscCssTransform(code: string) {
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
