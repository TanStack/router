/**
 * When an effect that sets state only the split component reads runs, on
 * the Vite dev server (`route-app.ts`): the same whether the module writes
 * the state in its declaration (`let calls = seed()`) or in a statement
 * after it (`calls = seed()`, `calls += seed()`). Moving an initialiser to
 * a lazy chunk is allowed (G3; DECISIONS R29/R31), so either may run at load
 * or at the first render, but both run at the same time, once, with the
 * value the code gives. A write of a pure value is the control. Builds are
 * in integration/code-splitter-effect-timing.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { head, loadRoute } from './route-app'

// A decorator runs user code when its class is defined (TypeScript
// `experimentalDecorators`, as dependency injection libraries use them, on a
// parameter as on the class): a class carrying one is an effect, which keeps
// its order with the effects after it.
describe.each([
  [
    'a constructor parameter',
    `class Service {\n  constructor(@Inject() readonly dep: unknown) {}\n}`,
  ],
  [
    'a method parameter',
    `class Service {\n  constructor(readonly dep: unknown) {}\n  with(@Inject() other: unknown) { return other }\n}`,
  ],
  [
    'the class (control)',
    `@Register()\nclass Service {\n  constructor(readonly dep: unknown) {}\n}`,
  ],
])(
  'on the Vite dev server, a class only the split component uses with a decorator on %s',
  (_name, declaration) => {
    it('runs its decorator before the effects written after it', async () => {
      const route = await loadRoute(
        `${head}import { Inject, Register } from './di'
${declaration}
;(globalThis as any).seed('after')
export const Route = createFileRoute('/')({
  component: () => <p>{String(new Service(1).dep)}</p>,
})
`,
        {
          tsconfig: { experimentalDecorators: true },
          files: {
            'di.ts': `export const Inject = () => (_target: unknown, _key: unknown, _index: number) => {
  ;(globalThis as any).seed('decorator')
}
export const Register = () => (_target: unknown) => {
  ;(globalThis as any).seed('decorator')
}
`,
          },
        },
      )
      const run = await route.run<{ atLoad: Array<string>; html: string }>(
        `const atLoad = [...globalThis.seeded]
const html = await render('component')
return { atLoad, html }`,
        {
          before: `globalThis.seeded = []; globalThis.seed = (name) => globalThis.seeded.push(name)`,
        },
      )
      expect(run).toEqual({ atLoad: ['decorator', 'after'], html: '<p>1</p>' })
    })
  },
)
