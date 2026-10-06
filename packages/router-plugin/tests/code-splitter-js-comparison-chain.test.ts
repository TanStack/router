import { describe, expect, it } from 'vitest'
import { compileRouteModules } from './regression-helpers'

// In a JavaScript route file, `a < b > (c)` is two comparisons, so `b` is a
// value that every emitted module evaluating the expression must declare.
describe('code-splitter in plain JavaScript route files', () => {
  it('keeps the operands of a chained comparison next to the expression', () => {
    const { modules } = compileRouteModules(
      `import { createFileRoute } from '@tanstack/react-router'
const a = 1, b = 2, c = 3
const r = a < b > (c)
export const Route = createFileRoute('/compare')({
  loader: () => r,
  component: () => <p>{String(r)}</p>,
})
`,
      { filename: 'route.js' },
    )
    for (const module of Object.values(modules)) {
      if (/\ba\s*<\s*b\s*>/.test(module)) {
        expect(module).toMatch(/\bb\s*=\s*2|import\s*\{[^}]*\bb\b[^}]*\}/)
      }
    }
  })
})
