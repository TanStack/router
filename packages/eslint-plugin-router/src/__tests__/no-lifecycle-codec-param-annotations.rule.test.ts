import { RuleTester } from '@typescript-eslint/rule-tester'

import {
  name,
  rule,
} from '../rules/no-lifecycle-codec-param-annotations/no-lifecycle-codec-param-annotations.rule'

const ruleTester = new RuleTester()

ruleTester.run(name, rule, {
  valid: [
    {
      name: 'inferred parameters on every codec key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: async ({ params }) => ({ postId: params.postId }),
            dehydrate: ({ data }) => ({ postId: data.postId }),
            hydrate: ({ data, context }) => ({ postId: data.postId, context }),
            revalidate: ({ prev }) => prev ?? { postId: '' },
          },
          beforeLoad: {
            handler: () => ({ b: 1 }),
            dehydrate: ({ data }) => data,
            hydrate: ({ data }) => data,
          },
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: ({ data }) => data,
            hydrate: ({ data }) => data,
            staleReloadMode: 'blocking',
          },
        })
      `,
    },
    {
      name: 'boolean codec values and no parameters',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: () => ({ a: 1 }),
            dehydrate: true,
            revalidate: true,
          },
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: false,
            hydrate: () => ({ l: 2 }),
          },
        })
      `,
    },
    {
      name: 'function expressions and method shorthand without annotations',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: function ({ data }) {
              return data
            },
            hydrate({ data }) {
              return data
            },
          },
        })
      `,
    },
    {
      name: 'async codecs without annotations',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: async ({ data }) => data,
            hydrate: async ({ data }) => data,
          },
        })
      `,
    },
    {
      name: 'the handler parameter is not covered by this rule',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: ({ params }: { params: { postId: string } }) => params,
            dehydrate: ({ data }) => data,
            hydrate: ({ data }) => data,
          },
        })
      `,
    },
    {
      name: 'function-form lifecycles are not covered by this rule',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: ({ params }: { params: { postId: string } }) => params,
          beforeLoad: (ctx: any) => ctx,
          loader: (ctx: unknown) => ctx,
        })
      `,
    },
    {
      name: 'codecs passed by reference are not inspected',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const hydrate = ({ data }: { data: { l: number } }) => data
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: ({ data }) => data,
            hydrate,
          },
        })
      `,
    },
    {
      name: 'a return type annotation is allowed',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: ({ data }): { l: number } => data,
            hydrate: ({ data }): { l: number } => data,
          },
        })
      `,
    },
    {
      name: 'codec keys on non-lifecycle properties are not inspected',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          search: {
            hydrate: (value: string) => value,
          },
        })
      `,
    },
    {
      name: 'lifecycle-like objects outside a createRoute call are not inspected',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        const options = {
          loader: {
            handler: () => ({ l: 1 }),
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        }
      `,
    },
    {
      name: 'createRoute functions from other packages are ignored',
      code: `
        import { createFileRoute } from 'other-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
    },
    {
      name: 'a this pseudo-parameter is skipped and the value parameter is inferred',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: function (this: void, { data }) {
              return data
            },
            hydrate(this: void, { data }) {
              return data
            },
          },
        })
      `,
    },
    {
      name: 'a this pseudo-parameter without a value parameter is not reported',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate(this: void) {
              return { l: 2 }
            },
          },
        })
      `,
    },
    {
      name: 'wrapped options in the valid form',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: ({ data }) => data,
            hydrate: ({ data }) => data,
          },
        } satisfies RouteOptions)
      `,
    },
    {
      name: 'a createRoute that is not imported from a router package is not inspected',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        declare const createRoute: any
        export const Route = createRoute({
          loader: {
            handler: () => ({ l: 1 }),
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
    },
  ],
  invalid: [
    {
      name: 'annotated dehydrate parameter on context',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: () => ({ a: 1 }),
            dehydrate: ({ data }: { data: { a: number } }) => data,
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'dehydrate' },
          line: 6,
          column: 33,
        },
      ],
    },
    {
      name: 'annotated hydrate parameter on beforeLoad',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          beforeLoad: {
            handler: () => ({ b: 1 }),
            dehydrate: true,
            hydrate: (ctx: any) => ctx.data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'beforeLoad', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated hydrate parameter on loader',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated revalidate parameter on context',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: () => ({ a: 1 }),
            revalidate: ({ prev }: { prev?: { a: number } }) => prev ?? { a: 2 },
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'revalidate' },
        },
      ],
    },
    {
      name: 'annotated parameter on a function expression',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: function ({ data }: { data: { l: number } }) {
              return data
            },
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'dehydrate' },
        },
      ],
    },
    {
      name: 'annotated parameter on a method shorthand',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate({ data }: { data: { l: number } }) {
              return data
            },
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated async arrow parameter',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: async ({ data }: { data: { l: number } }) => data,
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'dehydrate' },
        },
      ],
    },
    {
      name: 'annotated identifier parameter with a default value',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: (ctx: any = {}) => ctx.data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated rest parameter',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: (...args: [any]) => args[0].data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated parameter behind a quoted key',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          'loader': {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            'hydrate': ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'annotated parameter behind an as-expression',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: (({ data }: { data: { l: number } }) => data) as any,
          } as const,
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'the value parameter after a this pseudo-parameter is reported (function expression)',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: function (this: void, { data }: { data: { l: number } }) {
              return data
            },
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'dehydrate' },
          line: 6,
          column: 54,
        },
      ],
    },
    {
      name: 'the value parameter after a this pseudo-parameter is reported (method shorthand)',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate(this: void, ctx: any) {
              return ctx.data
            },
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
          line: 7,
          column: 36,
        },
      ],
    },
    {
      name: 'the value parameter after an unannotated this pseudo-parameter is reported',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate(this, ctx: any) {
              return ctx.data
            },
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
          line: 7,
          column: 30,
        },
      ],
    },
    {
      name: 'satisfies around the options of an indirect factory',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        } satisfies RouteOptions)
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'as const around the options of a direct factory',
      code: `
        import { createRoute } from '@tanstack/react-router'
        export const Route = createRoute({
          getParentRoute: () => rootRoute,
          path: '/posts',
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        } as const)
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'a type assertion around the options',
      code: `
        import { createRootRoute } from '@tanstack/react-router'
        export const Route = createRootRoute(<RouteOptions>{
          beforeLoad: {
            handler: () => ({ b: 1 }),
            dehydrate: ({ data }: { data: { b: number } }) => data,
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'beforeLoad', property: 'dehydrate' },
        },
      ],
    },
    {
      name: 'a non-null assertion around the options',
      code: `
        import { createRootRouteWithContext } from '@tanstack/react-router'
        export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
          context: {
            handler: () => ({ a: 1 }),
            revalidate: ({ prev }: { prev?: { a: number } }) => prev ?? { a: 1 },
          },
        }!)
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'revalidate' },
        },
      ],
    },
    {
      name: 'parentheses around the options',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')(({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        }))
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'stacked wrappers around the options',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')(((({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        }) as const) satisfies RouteOptions)!)
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'every annotated codec is reported',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        export const Route = createFileRoute('/posts/$postId')({
          context: {
            handler: () => ({ a: 1 }),
            dehydrate: ({ data }: any) => data,
            hydrate: ({ data }: any) => data,
            revalidate: ({ prev }: any) => prev,
          },
          beforeLoad: {
            handler: () => ({ b: 1 }),
            dehydrate: ({ data }: any) => data,
            hydrate: ({ data }: any) => data,
          },
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: ({ data }: any) => data,
            hydrate: ({ data }: any) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'dehydrate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'hydrate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'revalidate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'beforeLoad', property: 'dehydrate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'beforeLoad', property: 'hydrate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'dehydrate' },
        },
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'createRoute',
      code: `
        import { createRoute } from '@tanstack/react-router'
        export const Route = createRoute({
          getParentRoute: () => rootRoute,
          path: '/posts',
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'createRootRoute',
      code: `
        import { createRootRoute } from '@tanstack/react-router'
        export const Route = createRootRoute({
          beforeLoad: {
            handler: () => ({ b: 1 }),
            dehydrate: ({ data }: { data: { b: number } }) => data,
            hydrate: ({ data }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'beforeLoad', property: 'dehydrate' },
        },
      ],
    },
    {
      name: 'createRootRouteWithContext',
      code: `
        import { createRootRouteWithContext } from '@tanstack/react-router'
        export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
          context: {
            handler: () => ({ a: 1 }),
            revalidate: ({ prev }: { prev?: { a: number } }) => prev ?? { a: 1 },
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'revalidate' },
        },
      ],
    },
    {
      name: 'solid-router import',
      code: `
        import { createFileRoute } from '@tanstack/solid-router'
        export const Route = createFileRoute('/posts/$postId')({
          loader: {
            handler: () => ({ l: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { l: number } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
  ],
})

// The factories are resolved through their import from a TanStack Router
// package: an alias or a namespace import is checked, a local binding with the
// same name is not.
ruleTester.run(`${name} (router imports)`, rule, {
  valid: [
    {
      name: 'a local binding that shadows the import is not inspected',
      code: `
        import { createFileRoute } from '@tanstack/react-router'
        function make(createFileRoute: any) {
          return createFileRoute('/x')({
            loader: {
              handler: () => 1,
              dehydrate: true,
              hydrate: ({ data }: { data: number }) => data,
            },
          })
        }
      `,
    },
  ],
  invalid: [
    {
      name: 'an aliased import',
      code: `
        import { createFileRoute as cfr } from '@tanstack/react-router'
        export const Route = cfr('/x')({
          loader: {
            handler: () => ({ a: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { b: string } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'a namespace import',
      code: `
        import * as Router from '@tanstack/vue-router'
        export const Route = Router.createFileRoute('/x')({
          context: {
            handler: () => ({ a: 1 }),
            dehydrate: true,
            hydrate: ({ data }: { data: { b: string } }) => data,
          },
        })
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'context', property: 'hydrate' },
        },
      ],
    },
    {
      name: 'an import declared after the route',
      code: `
        export const Route = createFileRoute('/x')({
          loader: {
            handler: () => 1,
            dehydrate: true,
            hydrate: ({ data }: { data: number }) => data,
          },
        })
        import { createFileRoute } from '@tanstack/react-router'
      `,
      errors: [
        {
          messageId: 'annotatedParam',
          data: { lifecycle: 'loader', property: 'hydrate' },
        },
      ],
    },
  ],
})
