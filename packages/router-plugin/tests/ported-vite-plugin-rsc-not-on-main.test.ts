/**
 * Edge cases ported from the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT) that
 * the Babel-based code splitter on main miscompiles. Each test names the
 * plugin-rsc fixture it is ported from.
 */
import { transformWithOxc } from 'vite'
import { expect, it } from 'vitest'
import { compileCodeSplitVirtualRoute } from '../src/core/code-splitter/compilers'
import { getModuleErrors } from './validate-module'

// typescript-eslint/type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js
// Main prints `(count as number)++` as `count as number++`, which does not
// parse. Impact on main: the split route chunk fails the build.
it('a split component keeps the parentheses around asserted update operands', async () => {
  const component = compileCodeSplitVirtualRoute({
    code: `import { createFileRoute } from '@tanstack/react-router'
let count = 0
function Page() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}
export const Route = createFileRoute('/')({ component: Page })
`,
    filename: 'route.tsx?tsr-split=component',
    splitTargets: ['component'],
  }).code
  expect(await getModuleErrors(component)).toEqual([])
  const { code } = await transformWithOxc(component, 'module.ts')
  const module = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`
  )
  expect(module.component()).toBe(4)
})
