import { describe, expect, it } from 'vitest'
import { parseAst } from '@tanstack/router-utils'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getReferenceRouteCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { frameworks } from './constants'

/**
 * Collects the string argument of every generated split-route importer,
 * i.e. `const $$splitXImporter = () => import('...')`, from compiled code.
 */
function getImporterUrls(code: string): Array<string> {
  const ast = parseAst({ code })
  const urls: Array<string> = []

  for (const statement of ast.program.body) {
    if (statement.type !== 'VariableDeclaration') continue
    for (const declaration of statement.declarations) {
      const init = declaration.init
      if (
        init?.type === 'ArrowFunctionExpression' &&
        init.body.type === 'CallExpression' &&
        init.body.callee.type === 'Import' &&
        init.body.arguments[0]?.type === 'StringLiteral'
      ) {
        urls.push(init.body.arguments[0].value)
      }
    }
  }

  return urls
}

// https://github.com/TanStack/router/issues/7754
describe('code-splitter handles special characters in the file path', () => {
  describe.each(frameworks)('FRAMEWORK=%s', (framework) => {
    it('compiles a route whose absolute path contains a single quote', () => {
      const filename = "/Users/dev/it's a repro/app/src/routes/index.tsx"
      const code = `
import { createFileRoute } from '@tanstack/${framework}-router'

export const Route = createFileRoute('/')({
  component: () => 'Hello',
})
`

      // Without escaping, this throws while parsing the generated
      // `import('...')` statement, since `'` terminates the literal early
      const compileResult = compileCodeSplitReferenceRoute({
        code,
        filename,
        id: filename,
        addHmr: false,
        codeSplitGroupings: defaultCodeSplitGroupings,
        targetFramework: framework,
        compilerPlugins: getReferenceRouteCompilerPlugins({
          targetFramework: framework,
          addHmr: false,
        }),
      })

      // The importer URL must round-trip the filename exactly
      expect(getImporterUrls(compileResult.code)).toContain(
        `${filename}?tsr-split=component`,
      )
    })
  })
})
