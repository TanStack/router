import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'

// In a JavaScript route file, `a < b > (c)` is two comparisons, so `b` is a
// value that every emitted module evaluating the expression must declare.
describe('code-splitter in plain JavaScript route files', () => {
  it('keeps the operands of a chained comparison next to the expression', () => {
    const filename = 'route.js'
    const code = `import { createFileRoute } from '@tanstack/react-router'
const a = 1, b = 2, c = 3
const r = a < b > (c)
export const Route = createFileRoute('/compare')({
  loader: () => r,
  component: () => <p>{String(r)}</p>,
})
`
    const sharedBindings = computeSharedBindings({
      code,
      filename,
      codeSplitGroupings: defaultCodeSplitGroupings,
    })
    const modules = [
      compileCodeSplitVirtualRoute({
        code,
        filename: `${filename}?tsr-split=component`,
        splitTargets: ['component'],
        sharedBindings: sharedBindings.size ? sharedBindings : undefined,
      }).code,
    ]
    if (sharedBindings.size) {
      modules.push(
        compileCodeSplitSharedRoute({
          code,
          sharedBindings,
          filename: `${filename}?tsr-shared=1`,
        }).code,
      )
    }
    for (const module of modules) {
      if (/\ba\s*<\s*b\s*>/.test(module)) {
        expect(module).toMatch(/\bb\s*=\s*2|import\s*\{[^}]*\bb\b[^}]*\}/)
      }
    }
  })
})
