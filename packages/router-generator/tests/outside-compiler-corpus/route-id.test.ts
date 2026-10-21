/** Package/config or fixed-input observer control; not compiler acceptance. */
/** Controls of the shared `routeCallOf` helper (route-id.ts). */
import { describe, expect, test } from 'vitest'
import { routeCallOf } from '../route-id'

describe('routeCallOf', () => {
  test.each(['react', 'solid', 'vue'])(
    'reads the constructor and id of a %s route file',
    (framework) => {
      expect(
        routeCallOf(`import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/posts/$id')({ component: () => null })`),
      ).toEqual({ constructor: 'createFileRoute', id: '/posts/$id' })
    },
  )

  test.each([
    {
      name: 'a lazy file route',
      code: `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/lazy')({})`,
      expected: { constructor: 'createLazyFileRoute', id: '/lazy' },
    },
    {
      name: 'a root route',
      code: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      expected: { constructor: 'createRootRoute', id: undefined },
    },
    {
      name: 'an aliased constructor, a template literal and wrappers',
      code: `import { createFileRoute as cfr } from '@tanstack/react-router'
export const Route = (cfr(\`/a\` as any)({}) as any)`,
      expected: { constructor: 'createFileRoute', id: '/a' },
    },
    {
      name: 'a namespace import',
      code: `import * as Router from '@tanstack/react-router'
export const Route = Router.createFileRoute("/a")({})`,
      expected: { constructor: 'createFileRoute', id: '/a' },
    },
    {
      name: 'a declaration exported in an export list',
      code: `import { createFileRoute } from '@tanstack/react-router'
const route = createFileRoute('/a')({})
const other = createFileRoute('/other')({})
export { route as Route, other }`,
      expected: { constructor: 'createFileRoute', id: '/a' },
    },
    {
      name: 'a constructor not imported from a router package',
      code: `import { createFileRoute } from '../local'
export const Route = createFileRoute('/a')({})`,
      expected: { constructor: undefined, id: '/a' },
    },
    {
      name: 'a constructor imported for its type only',
      code: `import { type createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/a')({})`,
      expected: { constructor: undefined, id: '/a' },
    },
    {
      name: 'JSX',
      code: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/jsx')({ component: Page })
function Page() {
  return <><h1>Title</h1><p>Body</p></>
}`,
      expected: { constructor: 'createFileRoute', id: '/jsx' },
    },
  ])('reads $name', ({ code, expected }) => {
    expect(routeCallOf(code)).toEqual(expected)
  })

  test('fails on a file that does not parse or exports no Route call', () => {
    expect(() =>
      routeCallOf(`import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/a')({}`),
    ).toThrow()
    expect(() => routeCallOf(`export const Route = 1`)).toThrow()
    expect(() => routeCallOf(`export const helper = 1`)).toThrow()
  })
})
