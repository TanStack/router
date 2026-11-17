/**
 * When code only the split component reads runs, on the Vite dev server
 * (`route-app.ts`): a decorator on a class runs when the route module loads,
 * in source order; a destructuring default or computed key runs once, and
 * the component reads its value. Which of two outputs an effect runs in is
 * free (SPEC G3): no order between effects of different outputs is checked.
 */
import { describe, expect, it } from 'vitest'
import { head, loadRoute } from './route-app'

// A decorator runs user code when its class is defined (TypeScript
// `experimentalDecorators`, as dependency injection libraries use them, on a
// parameter as on the class). `main` never removes a class from the route
// module (R163): it runs when the route module loads, in source order (the
// chunk's copy runs it again, as on `main`).
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
    'the class',
    `@Register()\nclass Service {\n  constructor(readonly dep: unknown) {}\n}`,
  ],
])(
  'on the Vite dev server, a class only the split component uses with a decorator on %s',
  (_name, declaration) => {
    it('runs its decorator when the route module loads, before the effects written after it', async () => {
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
      const run = await route.run<{
        atLoad: Array<string>
        html: string
      }>(
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

// A destructuring default or computed key runs user code when the
// declaration evaluates, like an initialiser does (`const beta = flags.beta
// ?? track()`): once, whether at load or when the split component loads.
describe.each([
  [
    'an object pattern default',
    `const { beta = track('beta') } = {} as { beta?: string }`,
  ],
  [
    'an array pattern default',
    `const [beta = track('beta')] = [] as Array<string>`,
  ],
  [
    'a computed key',
    `const { [track('beta')]: beta } = { beta: 'beta' } as Record<string, string>`,
  ],
])(
  'on the Vite dev server, %s only the split component reads',
  (_name, declaration) => {
    it('runs once, and the component reads its value', async () => {
      const route = await loadRoute(
        `${head}import { track } from './analytics'
${declaration}
track('after')
export const Route = createFileRoute('/')({
  component: () => <p>{String(beta)}</p>,
})
`,
        {
          files: {
            'analytics.ts': `export const track = (name: string) => {
  ;(globalThis as any).seed(name)
  return name
}
`,
          },
        },
      )
      const run = await route.run<{ html: string; after: Array<string> }>(
        `const html = await render('component')
return { html, after: [...globalThis.seeded].sort() }`,
        {
          before: `globalThis.seeded = []; globalThis.seed = (name) => globalThis.seeded.push(name)`,
        },
      )
      expect(run).toEqual({ html: '<p>beta</p>', after: ['after', 'beta'] })
    })
  },
)
