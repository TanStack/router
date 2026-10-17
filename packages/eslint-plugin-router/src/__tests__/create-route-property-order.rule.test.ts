import { RuleTester } from '@typescript-eslint/rule-tester'
import combinate from 'combinate'
import { describe, expect, test } from 'vitest'

import {
  name,
  rule,
} from '../rules/create-route-property-order/create-route-property-order.rule'
import {
  checkedProperties,
  lifecycleExpectedOrder,
  lifecycleSortRules,
} from '../rules/create-route-property-order/constants'
import { getCheckedProperties } from '../rules/create-route-property-order/create-route-property-order.utils'
import {
  createRouteFunctionsDirect,
  createRouteFunctionsIndirect,
} from '../utils/route-options'
import {
  generateInterleavedCombinations,
  generatePartialCombinations,
  generatePermutations,
  normalizeIndent,
} from './test-utils'
import type { CreateRouteFunction } from '../utils/route-options'

const ruleTester = new RuleTester()

// reduce the number of test cases by only testing a subset of the checked properties
const testedCheckedProperties = [
  checkedProperties[0]!,
  checkedProperties[1]!,
  checkedProperties[2]!,
  checkedProperties[3]!,
]
type TestedCheckedProperties = (typeof testedCheckedProperties)[number]
const orderIndependentProps = ['gcTime', '...foo'] as const
type OrderIndependentProps = (typeof orderIndependentProps)[number]

// reduce the number of test cases by only testing the first function of createRouteFunctionsDirect
const testedCreateRouteFunctions = [
  ...createRouteFunctionsIndirect,
  createRouteFunctionsDirect[0],
]
type TestedCreateRouteFunction = (typeof testedCreateRouteFunctions)[number]

interface TestCase {
  createRouteFunction: TestedCreateRouteFunction
  properties: Array<TestedCheckedProperties | OrderIndependentProps>
}

const validTestMatrix = combinate({
  createRouteFunction: testedCreateRouteFunctions,
  properties: generatePartialCombinations(testedCheckedProperties, 2),
})

export function generateInvalidPermutations(
  arr: ReadonlyArray<TestedCheckedProperties>,
): Array<{
  invalid: Array<TestedCheckedProperties>
  valid: Array<TestedCheckedProperties>
}> {
  const combinations = generatePartialCombinations(arr, 2)
  const allPermutations: Array<{
    invalid: Array<TestedCheckedProperties>
    valid: Array<TestedCheckedProperties>
  }> = []

  for (const combination of combinations) {
    const permutations = generatePermutations(combination)
    // skip the first permutation as it matches the original combination
    const invalidPermutations = permutations.slice(1)

    if (
      combination.includes('params') &&
      combination.includes('validateSearch')
    ) {
      if (
        combination.indexOf('params') < combination.indexOf('validateSearch')
      ) {
        // since we ignore the relative order of 'params' and 'validateSearch', we skip this combination (but keep the other one where `validateSearch` is before `params`)
        continue
      }
    }

    allPermutations.push(
      ...invalidPermutations.map((p) => {
        // ignore the relative order of 'params' and 'validateSearch'
        const correctedValid = [...combination].sort((a, b) => {
          if (
            (a === 'params' && b === 'validateSearch') ||
            (a === 'validateSearch' && b === 'params')
          ) {
            return p.indexOf(a) - p.indexOf(b)
          }
          return checkedProperties.indexOf(a) - checkedProperties.indexOf(b)
        })
        return { invalid: p, valid: correctedValid }
      }),
    )
  }

  return allPermutations
}

const invalidPermutations = generateInvalidPermutations(testedCheckedProperties)

type Interleaved = TestedCheckedProperties | OrderIndependentProps
const interleavedInvalidPermutations: Array<{
  invalid: Array<Interleaved>
  valid: Array<Interleaved>
}> = []
for (const invalidPermutation of invalidPermutations) {
  const invalid = generateInterleavedCombinations(
    invalidPermutation.invalid,
    orderIndependentProps,
  )
  const valid = generateInterleavedCombinations(
    invalidPermutation.valid,
    orderIndependentProps,
  )

  for (let i = 0; i < invalid.length; i++) {
    interleavedInvalidPermutations.push({
      invalid: invalid[i]!,
      valid: valid[i]!,
    })
  }
}

const invalidTestMatrix = combinate({
  createRouteFunction: testedCreateRouteFunctions,
  properties: interleavedInvalidPermutations,
})

function getCode({ createRouteFunction, properties }: TestCase) {
  let invocation = ''
  switch (createRouteFunction) {
    case 'createFileRoute': {
      invocation = `('/_layout/hello/foo/$id')`
      break
    }
    case 'createRootRouteWithContext': {
      invocation = normalizeIndent`
      <{
          queryClient: QueryClient
       }>()`
      break
    }
  }
  function getPropertyCode(
    property: TestedCheckedProperties | OrderIndependentProps,
  ) {
    if (property.startsWith('...')) {
      return property
    }
    return `${property}: () => null`
  }
  return `
    import { ${createRouteFunction} } from '@tanstack/react-router'

    const Route = ${createRouteFunction}${invocation}({
        ${properties.map(getPropertyCode).join(',\n        ')}
    })
  `
}

const validTestCases = validTestMatrix.map(
  ({ createRouteFunction, properties }) => ({
    name: `should pass when order is correct for ${createRouteFunction} with order: ${properties.join(', ')}`,
    code: getCode({ createRouteFunction, properties }),
  }),
)

invalidTestMatrix.push({
  createRouteFunction: 'createFileRoute',
  properties: {
    invalid: ['loader', 'loaderDeps'],
    valid: ['loaderDeps', 'loader'],
  },
})

invalidTestMatrix.push({
  createRouteFunction: 'createFileRoute',
  properties: { invalid: ['head', 'loader'], valid: ['loader', 'head'] },
})

function countSpreadsBefore(
  properties: ReadonlyArray<string>,
  property: string,
): number {
  return properties
    .slice(0, properties.indexOf(property))
    .filter((p) => p.startsWith('...')).length
}

// A key before a spread is a default and a key after it an override, so the
// fix never moves a key across a spread. An order that can only be fixed that
// way is reported without a fix.
function movesAcrossSpread(
  invalid: ReadonlyArray<string>,
  valid: ReadonlyArray<string>,
): boolean {
  return invalid.some(
    (property) =>
      !property.startsWith('...') &&
      countSpreadsBefore(invalid, property) !==
        countSpreadsBefore(valid, property),
  )
}

const invalidTestCases = invalidTestMatrix.map(
  ({ createRouteFunction, properties }) => ({
    name: `incorrect property order is detected for ${createRouteFunction} with order: ${properties.invalid.join(', ')}`,
    code: getCode({
      createRouteFunction,
      properties: properties.invalid,
    }),
    errors: [{ messageId: 'invalidOrder' as const }],
    output: movesAcrossSpread(properties.invalid, properties.valid)
      ? null
      : getCode({
          createRouteFunction,
          properties: properties.valid,
        }),
  }),
)

ruleTester.run(name, rule, {
  valid: validTestCases,
  invalid: invalidTestCases,
})

// ---------------------------------------------------------------------------
// Lifecycle object form: `context` / `beforeLoad` / `loader` written as
// `{ handler, dehydrate, hydrate, revalidate | staleReloadMode }`
// ---------------------------------------------------------------------------

const lifecycleKeys = ['context', 'beforeLoad', 'loader'] as const
type LifecycleKey = (typeof lifecycleKeys)[number]

// `revalidate` exists on `context` only and `staleReloadMode` on `loader` only;
// each sorts after `hydrate` in its own lifecycle, and `beforeLoad` has no
// trailing key. The fixtures below are generated from the sort table, so the
// table is pinned first: a key of another lifecycle must not be in it, or a
// generated fixture would carry a key the API rejects.
describe('lifecycle sort table', () => {
  const expectedKeys: Array<[LifecycleKey, Array<string>]> = [
    ['context', ['handler', 'dehydrate', 'hydrate', 'revalidate']],
    ['beforeLoad', ['handler', 'dehydrate', 'hydrate']],
    ['loader', ['handler', 'dehydrate', 'hydrate', 'staleReloadMode']],
  ]
  test.each(expectedKeys)('%s orders exactly %j', (lifecycle, expected) => {
    expect(getCheckedProperties(lifecycleSortRules[lifecycle])).toEqual(
      expected,
    )
  })
  test.each(expectedKeys)('%s reports the order %j', (lifecycle, expected) => {
    expect(lifecycleExpectedOrder[lifecycle]).toBe(
      expected.map((key) => `\`${key}\``).join(', '),
    )
  })
})

function getLifecycleCode(
  lifecycle: LifecycleKey,
  properties: ReadonlyArray<string>,
  createRouteFunction: CreateRouteFunction = 'createFileRoute',
) {
  let invocation = ''
  switch (createRouteFunction) {
    case 'createFileRoute': {
      invocation = `('/posts/$postId')`
      break
    }
    case 'createRootRouteWithContext': {
      invocation = `<{ queryClient: QueryClient }>()`
      break
    }
  }
  function getPropertyCode(property: string) {
    if (property.startsWith('...')) {
      return property
    }
    if (property === 'revalidate') {
      return 'revalidate: true'
    }
    if (property === 'staleReloadMode') {
      return `staleReloadMode: 'blocking'`
    }
    return `${property}: () => null`
  }
  return `
    import { ${createRouteFunction} } from '@tanstack/react-router'

    const Route = ${createRouteFunction}${invocation}({
        ${lifecycle}: {
            ${properties.map(getPropertyCode).join(',\n            ')}
        },
    })
  `
}

// RuleTester hydrates the message template with `data`, so every placeholder
// has to be provided for the comparison to succeed.
function lifecycleOrderError(
  lifecycle: LifecycleKey,
  createRouteFunction: CreateRouteFunction = 'createFileRoute',
) {
  return {
    messageId: 'invalidLifecycleOrder' as const,
    data: {
      property: lifecycle,
      function: createRouteFunction,
      expected: lifecycleExpectedOrder[lifecycle],
    },
  }
}

const lifecycleValidTestCases: Array<{ name: string; code: string }> = []
const lifecycleInvalidTestCases: Array<{
  name: string
  code: string
  errors: Array<ReturnType<typeof lifecycleOrderError>>
  output: string | Array<string>
}> = []

for (const lifecycle of lifecycleKeys) {
  const orderedKeys = getCheckedProperties(lifecycleSortRules[lifecycle])
  for (const combination of generatePartialCombinations(orderedKeys, 2)) {
    const permutations = generatePermutations(combination)
    lifecycleValidTestCases.push({
      name: `lifecycle object order is accepted for ${lifecycle} with order: ${combination.join(', ')}`,
      code: getLifecycleCode(lifecycle, combination),
    })
    for (const permutation of permutations.slice(1)) {
      lifecycleInvalidTestCases.push({
        name: `lifecycle object order is fixed for ${lifecycle} with order: ${permutation.join(', ')}`,
        code: getLifecycleCode(lifecycle, permutation),
        errors: [lifecycleOrderError(lifecycle)],
        output: getLifecycleCode(lifecycle, combination),
      })
    }
  }
}

ruleTester.run(`${name} (lifecycle object form)`, rule, {
  valid: [
    ...lifecycleValidTestCases,
    {
      name: 'function form lifecycles are not checked for nested order',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          context: () => ({ a: 1 }),
          beforeLoad: async () => ({ b: 2 }),
          loader: () => null,
        })
      `,
    },
    // Every key the object form accepts is in the sort table. A spread is
    // never sorted: it is not a key, whatever the spread value is called.
    {
      name: 'keys in the right order around spreads in the lifecycle object',
      code: getLifecycleCode('context', [
        '...shared',
        'handler',
        '...codec',
        'dehydrate',
        'hydrate',
      ]),
    },
    {
      name: 'a single key inside the lifecycle object is never reported',
      code: getLifecycleCode('loader', ['handler']),
    },
    {
      name: 'lifecycle-like objects outside a createRoute call are not checked',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const loader = {
          hydrate: () => null,
          handler: () => null,
        }
        const other = {
          loader: {
            hydrate: () => null,
            handler: () => null,
          },
        }
      `,
    },
    {
      name: 'lifecycle objects on non-lifecycle keys are not checked',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          search: {
            hydrate: () => null,
            handler: () => null,
          },
        })
      `,
    },
    {
      name: 'object form for createRootRouteWithContext in the right order',
      code: getLifecycleCode(
        'context',
        ['handler', 'dehydrate', 'hydrate', 'revalidate'],
        'createRootRouteWithContext',
      ),
    },
    {
      name: 'object form for createRootRoute in the right order',
      code: getLifecycleCode(
        'beforeLoad',
        ['handler', 'dehydrate', 'hydrate'],
        'createRootRoute',
      ),
    },
  ],
  invalid: [
    ...lifecycleInvalidTestCases,
    {
      name: 'nested order is fixed for createRootRouteWithContext',
      code: getLifecycleCode(
        'context',
        ['revalidate', 'hydrate', 'dehydrate', 'handler'],
        'createRootRouteWithContext',
      ),
      errors: [lifecycleOrderError('context', 'createRootRouteWithContext')],
      output: getLifecycleCode(
        'context',
        ['handler', 'dehydrate', 'hydrate', 'revalidate'],
        'createRootRouteWithContext',
      ),
    },
    {
      name: 'nested order is fixed for createRootRoute',
      code: getLifecycleCode(
        'loader',
        ['staleReloadMode', 'handler'],
        'createRootRoute',
      ),
      errors: [lifecycleOrderError('loader', 'createRootRoute')],
      output: getLifecycleCode(
        'loader',
        ['handler', 'staleReloadMode'],
        'createRootRoute',
      ),
    },
    {
      name: 'nested order is fixed for createRoute',
      code: getLifecycleCode(
        'beforeLoad',
        ['hydrate', 'dehydrate', 'handler'],
        'createRoute',
      ),
      errors: [lifecycleOrderError('beforeLoad', 'createRoute')],
      output: getLifecycleCode(
        'beforeLoad',
        ['handler', 'dehydrate', 'hydrate'],
        'createRoute',
      ),
    },
    // A key before a spread is a default and a key after it an override:
    // moving `hydrate` past `...codec` would change which `hydrate` runs.
    {
      name: 'an order that needs a key to cross a spread is reported without a fix',
      code: getLifecycleCode('context', [
        '...shared',
        'hydrate',
        '...codec',
        'dehydrate',
        'handler',
      ]),
      errors: [lifecycleOrderError('context')],
      output: null,
    },
    {
      name: 'keys are sorted within the run between two spreads',
      code: getLifecycleCode('context', [
        'dehydrate',
        'handler',
        '...codec',
        'hydrate',
      ]),
      errors: [lifecycleOrderError('context')],
      output: getLifecycleCode('context', [
        'handler',
        'dehydrate',
        '...codec',
        'hydrate',
      ]),
    },
    {
      name: 'keys after a spread are sorted without moving the spread',
      code: getLifecycleCode('loader', ['...shared', 'hydrate', 'handler']),
      errors: [lifecycleOrderError('loader')],
      output: getLifecycleCode('loader', ['...shared', 'handler', 'hydrate']),
    },
    {
      name: 'method shorthand and quoted keys are sorted inside the lifecycle object',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            'hydrate': ({ data }) => data,
            dehydrate({ data }) {
              return data
            },
            async handler() {
              return { a: 1 }
            },
          },
        })
      `,
      errors: [{ messageId: 'invalidLifecycleOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            async handler() {
              return { a: 1 }
            },
            dehydrate({ data }) {
              return data
            },
            'hydrate': ({ data }) => data,
          },
        })
      `,
    },
    {
      name: 'every lifecycle object is checked independently',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          context: {
            hydrate: () => null,
            handler: () => null,
          },
          beforeLoad: {
            handler: () => null,
            dehydrate: true,
          },
          loader: {
            staleReloadMode: 'blocking',
            handler: () => null,
          },
        })
      `,
      errors: [lifecycleOrderError('context'), lifecycleOrderError('loader')],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: () => null,
            hydrate: () => null,
          },
          beforeLoad: {
            handler: () => null,
            dehydrate: true,
          },
          loader: {
            handler: () => null,
            staleReloadMode: 'blocking',
          },
        })
      `,
    },
    {
      name: 'top-level and nested order are both fixed (two passes)',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            hydrate: () => null,
            handler: () => null,
          },
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }, lifecycleOrderError('loader')],
      output: [
        `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          beforeLoad: () => null,
          loader: {
            hydrate: () => null,
            handler: () => null,
          },
        })
      `,
        `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          beforeLoad: () => null,
          loader: {
            handler: () => null,
            hydrate: () => null,
          },
        })
      `,
      ],
    },
    // The fix moves member texts only; a comment between two members stays
    // where it is. When it would end up next to a different member, the
    // order is reported without a fix.
    {
      name: 'trailing comments next to moved members: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            hydrate: () => null, // restore
            handler: () => null, // run
          },
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: null,
    },
    {
      name: 'a directive above a moved member: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            // @ts-expect-error -- the wire type is wrong on purpose
            hydrate: ({ data }: { data: string }) => data,
            dehydrate: true,
            handler: () => 1,
          },
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: null,
    },
    {
      name: 'a comment inside a member value moves with the member',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            hydrate: ({ data }) => {
              // restore from the cache
              return data
            },
            handler: () => null,
          },
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => null,
            hydrate: ({ data }) => {
              // restore from the cache
              return data
            },
          },
        })
      `,
    },
  ],
})

// ---------------------------------------------------------------------------
// Fixer regressions: properties the sorter does not know must keep their text,
// and the fix must not change which value a key ends up with: a key never
// crosses a spread or a computed key.
// ---------------------------------------------------------------------------

ruleTester.run(`${name} (fixer keeps unknown properties)`, rule, {
  valid: [
    {
      name: 'a spread of a call expression does not crash the rule',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          beforeLoad: () => null,
          ...getOptions(),
          loader: () => null,
        })
      `,
    },
    {
      name: 'a spread named like a checked key is not that key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const beforeLoad = { loader: () => 'from spread' }
        const Route = createFileRoute('/x')({
          loader: () => null,
          ...beforeLoad,
        })
      `,
    },
    {
      name: 'a spread named like a lifecycle key is not that key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            handler: () => 1,
            hydrate: () => 2,
            ...dehydrate,
          },
        })
      `,
    },
  ],
  invalid: [
    {
      name: 'a quoted key survives the top-level fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          'component': () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          beforeLoad: () => null,
          'component': () => null,
          loader: () => null,
        })
      `,
    },
    {
      name: 'a key is not moved across a computed key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          [key]: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a key is not moved across a spread of a call expression',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          ...getOptions(),
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a key is not moved across a spread of an identifier',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => mine(),
          ...sharedOptions,
          beforeLoad: () => mineBeforeLoad(),
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a nested key is not moved across a spread of a call expression',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            staleReloadMode: 'background',
            ...getSharedLoader(),
            handler: () => fetchMine(),
          },
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: null,
    },
    {
      name: 'keys after a spread are sorted at the top level',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          ...sharedOptions,
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          ...sharedOptions,
          beforeLoad: () => null,
          loader: () => null,
        })
      `,
    },
    {
      name: 'a comment above a moved top-level key: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          // loads the post
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'comments next to keys that stay in place do not block the fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          // search params
          validateSearch: () => ({}),
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          // search params
          validateSearch: () => ({}),
          beforeLoad: () => null,
          loader: () => null,
        })
      `,
    },
    {
      name: 'a trailing comment on a key that stays in place, above a moved key: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          validateSearch: () => ({}), // search params
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a trailing next-line directive on a key that stays in place, above a moved key: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          validateSearch: () => ({}), // @ts-expect-error -- on purpose
          loader: () => (1 as number).toUpperCase(),
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a comment above a key after the moved keys stays on that key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          beforeLoad: () => null,
          // the page
          component: Page,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          beforeLoad: () => null,
          loader: () => null,
          // the page
          component: Page,
        })
      `,
    },
    {
      name: 'a trailing comment in a lifecycle object, above a moved key: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            handler: () => 1, // fetch
            hydrate: ({ data }) => data,
            dehydrate: ({ data }) => data,
          },
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: null,
    },
    {
      name: 'a trailing comment on a moved key: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null, // loads the post
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    // A comment between the first and the last key that changes position
    // blocks the fix even when its own key stays: the fix swaps `loader` and
    // `beforeLoad` around it, so a range directive there
    // (`/* eslint-disable no-console */`) would cover the other one.
    {
      name: 'a comment between keys that stay, with moved keys around it: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          component: Page,
          // the not-found page
          notFoundComponent: NotFound,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
    {
      name: 'a trailing comment on a key that stays between moved keys: reported without a fix',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          component: Page, // the page
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: null,
    },
  ],
})

// ---------------------------------------------------------------------------
// TypeScript wrappers around the options argument and around a lifecycle
// object value: `satisfies`, `as const`, `<T>` type assertions, non-null `!`
// and parentheses are looked through, and the fixer leaves the wrapper in
// place.
// ---------------------------------------------------------------------------

ruleTester.run(`${name} (wrapped options argument)`, rule, {
  valid: [
    {
      name: 'satisfies around the options of an indirect factory in the right order',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          beforeLoad: () => null,
          loader: () => null,
        } satisfies RouteOptions)
      `,
    },
    {
      name: 'as const around the options of a direct factory in the right order',
      code: `
        import { createRoute } from '@tanstack/react-router'
        const Route = createRoute({
          beforeLoad: () => null,
          loader: () => null,
        } as const)
      `,
    },
    {
      name: 'a wrapped lifecycle object inside wrapped options in the right order',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            handler: () => null,
            dehydrate: true,
            hydrate: () => null,
          } satisfies LoaderOptions,
        } satisfies RouteOptions)
      `,
    },
  ],
  invalid: [
    {
      name: 'satisfies around the options of an indirect factory',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: () => null,
          beforeLoad: () => null,
        } satisfies RouteOptions)
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          beforeLoad: () => null,
          loader: () => null,
        } satisfies RouteOptions)
      `,
    },
    {
      name: 'as const around the options of a direct factory',
      code: `
        import { createRoute } from '@tanstack/react-router'
        const Route = createRoute({
          loader: () => null,
          beforeLoad: () => null,
        } as const)
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createRoute } from '@tanstack/react-router'
        const Route = createRoute({
          beforeLoad: () => null,
          loader: () => null,
        } as const)
      `,
    },
    {
      name: 'a type assertion around the options',
      code: `
        import { createRootRoute } from '@tanstack/react-router'
        const Route = createRootRoute(<RouteOptions>{
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createRootRoute } from '@tanstack/react-router'
        const Route = createRootRoute(<RouteOptions>{
          beforeLoad: () => null,
          loader: () => null,
        })
      `,
    },
    {
      name: 'a non-null assertion around the options',
      code: `
        import { createRootRouteWithContext } from '@tanstack/react-router'
        const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
          loader: () => null,
          beforeLoad: () => null,
        }!)
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createRootRouteWithContext } from '@tanstack/react-router'
        const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
          beforeLoad: () => null,
          loader: () => null,
        }!)
      `,
    },
    {
      name: 'parentheses around the options',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')(({
          loader: () => null,
          beforeLoad: () => null,
        }))
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')(({
          beforeLoad: () => null,
          loader: () => null,
        }))
      `,
    },
    {
      name: 'stacked wrappers around the options',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')(((({
          loader: () => null,
          beforeLoad: () => null,
        }) as const) satisfies RouteOptions)!)
      `,
      errors: [{ messageId: 'invalidOrder' }],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')(((({
          beforeLoad: () => null,
          loader: () => null,
        }) as const) satisfies RouteOptions)!)
      `,
    },
    {
      name: 'the nested lifecycle order is checked inside wrapped options',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            hydrate: () => null,
            dehydrate: true,
            handler: () => null,
          } as const,
        } satisfies RouteOptions)
      `,
      errors: [lifecycleOrderError('loader')],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            handler: () => null,
            dehydrate: true,
            hydrate: () => null,
          } as const,
        } satisfies RouteOptions)
      `,
    },
    {
      name: 'a non-null assertion around the lifecycle object',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            hydrate: () => null,
            handler: () => null,
          }!,
        })
      `,
      errors: [lifecycleOrderError('loader')],
      output: `
        import { createFileRoute } from '@tanstack/react-router'
        const Route = createFileRoute('/x')({
          loader: {
            handler: () => null,
            hydrate: () => null,
          }!,
        })
      `,
    },
    {
      name: 'a type assertion around the lifecycle object',
      code: `
        import { createRoute } from '@tanstack/react-router'
        const Route = createRoute({
          context: <ContextOptions>{
            revalidate: true,
            handler: () => null,
          },
        })
      `,
      errors: [lifecycleOrderError('context', 'createRoute')],
      output: `
        import { createRoute } from '@tanstack/react-router'
        const Route = createRoute({
          context: <ContextOptions>{
            handler: () => null,
            revalidate: true,
          },
        })
      `,
    },
  ],
})

// ---------------------------------------------------------------------------
// The factories are resolved through their import from a TanStack Router
// package: an alias or a namespace import is checked, a local binding with the
// same name is not.
// ---------------------------------------------------------------------------

ruleTester.run(`${name} (router imports)`, rule, {
  valid: [
    {
      name: 'createRoute from another package is not checked',
      code: `
        import { createRoute } from 'some-other-lib'
        const Route = createRoute({
          loader: { hydrate: () => null, handler: () => null },
          beforeLoad: () => null,
        })
      `,
    },
    {
      name: 'a factory that is not imported is not checked',
      code: `
        const Route = createFileRoute('/x')({
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
    },
    {
      name: 'a local binding that shadows the import is not checked',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        function make(createFileRoute: any) {
          return createFileRoute('/x')({
            loader: () => null,
            beforeLoad: () => null,
          })
        }
      `,
    },
  ],
  invalid: [
    {
      name: 'an aliased import is checked and reported by its exported name',
      code: `
        import { createFileRoute as cfr } from '@tanstack/react-router'
        const Route = cfr('/x')({
          loader: { hydrate: () => null, handler: () => null },
          beforeLoad: () => null,
        })
      `,
      errors: [
        { messageId: 'invalidOrder', data: { function: 'createFileRoute' } },
        lifecycleOrderError('loader'),
      ],
      output: [
        `
        import { createFileRoute as cfr } from '@tanstack/react-router'
        const Route = cfr('/x')({
          beforeLoad: () => null,
          loader: { hydrate: () => null, handler: () => null },
        })
      `,
        `
        import { createFileRoute as cfr } from '@tanstack/react-router'
        const Route = cfr('/x')({
          beforeLoad: () => null,
          loader: { handler: () => null, hydrate: () => null },
        })
      `,
      ],
    },
    {
      name: 'a namespace import is checked',
      code: `
        import * as Router from '@tanstack/solid-router'
        const Route = Router.createRoute({
          loader: () => null,
          beforeLoad: () => null,
        })
      `,
      errors: [
        { messageId: 'invalidOrder', data: { function: 'createRoute' } },
      ],
      output: `
        import * as Router from '@tanstack/solid-router'
        const Route = Router.createRoute({
          beforeLoad: () => null,
          loader: () => null,
        })
      `,
    },
  ],
})
