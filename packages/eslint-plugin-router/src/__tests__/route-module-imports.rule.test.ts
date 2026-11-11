import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuleTester } from '@typescript-eslint/rule-tester'

import {
  name,
  rule,
} from '../rules/route-module-imports/route-module-imports.rule'

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
)
const moduleFile = path.join(fixtures, 'route-module/src/routes/index.tsx')
const appFile = path.join(fixtures, 'app/src/routes/index.tsx')
const generatedFile = path.join(fixtures, 'route-module/src/routeScope.gen.ts')

const ruleTester = new RuleTester()

ruleTester.run(name, rule, {
  valid: [
    {
      name: 'scope imports in a route module',
      filename: moduleFile,
      code: `
        import { createFileRoute, Link } from '../routeScope.gen'
        export const Route = createFileRoute('@fixture/route-module:/')({})
      `,
    },
    {
      name: 'APIs the scope does not provide',
      filename: moduleFile,
      code: `
        import { Outlet, createSerializationAdapter } from '@tanstack/react-router'
        import { useServerFn } from '@tanstack/react-start'
      `,
    },
    {
      name: 'type-only imports',
      filename: moduleFile,
      code: `
        import type { Link } from '@tanstack/react-router'
        import { type useNavigate } from '@tanstack/solid-router'
      `,
    },
    {
      name: 'applications are not route modules',
      filename: appFile,
      code: `
        import { createFileRoute, Link, createRootRoute } from '@tanstack/react-router'
        import { createServerFn } from '@tanstack/react-start'
      `,
    },
    ...[
      generatedFile,
      path.join(fixtures, 'route-module/src/routeScope.gen.namespace0.ts'),
      path.join(fixtures, 'route-module/src/routeScope.gen.products.ts'),
      path.join(fixtures, 'route-module/src/routeScope.gen/products.ts'),
    ].map((filename) => ({
      name: `generated file ${path.relative(fixtures, filename)}`,
      filename,
      code: `
        import { createServerFn as createStartServerFn } from '@tanstack/react-start'
        import type { Router } from '@fixture/used/route-types'
      `,
    })),
    {
      name: 'imports from modules that are not used',
      filename: moduleFile,
      code: `
        import { schema } from '@fixture/shared'
        import type { Order } from '@fixture/used-not'
        import { used } from '../routeScope.gen'
      `,
    },
    {
      name: 'used modules imported by an application',
      filename: appFile,
      code: `
        import type { Router } from '@fixture/used/route-types'
      `,
    },
  ],
  invalid: [
    {
      name: 'imports from used modules',
      filename: moduleFile,
      code: `
        import type { Order } from '@fixture/used'
        import { formatPrice } from '@fixture/used/api'
        import { type Settings } from '@fixture/other'
      `,
      errors: [
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/used' } },
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/used' } },
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/other' } },
      ],
    },
    {
      name: 're-exports of and dynamic imports from used modules',
      filename: moduleFile,
      code: `
        export * from '@fixture/used/schemas'
        export type { Order } from '@fixture/used'
        const load = () => import('@fixture/other/api')
      `,
      errors: [
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/used' } },
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/used' } },
        { messageId: 'noUsedModuleImport', data: { module: '@fixture/other' } },
      ],
    },
    {
      name: 'routing APIs from the framework package',
      filename: moduleFile,
      code: `
        import { createFileRoute, Link as RouterLink, Outlet } from '@tanstack/react-router'
        import { useNavigate } from '@tanstack/vue-router'
        import { useLinkProps, useBlocker, notFound } from '@tanstack/solid-router'
      `,
      errors: [
        { messageId: 'useRouteScope', data: { name: 'createFileRoute' } },
        { messageId: 'useRouteScope', data: { name: 'Link' } },
        { messageId: 'useRouteScope', data: { name: 'useNavigate' } },
        { messageId: 'useRouteScope', data: { name: 'useLinkProps' } },
        { messageId: 'useRouteScope', data: { name: 'useBlocker' } },
        { messageId: 'useRouteScope', data: { name: 'notFound' } },
      ],
    },
    {
      name: 'root route constructors',
      filename: moduleFile,
      code: `
        import { createRootRouteWithContext } from '@tanstack/solid-router'
      `,
      errors: [
        {
          messageId: 'useModuleRoot',
          data: { name: 'createRootRouteWithContext' },
        },
      ],
    },
    {
      name: 'Start APIs from the framework package',
      filename: moduleFile,
      code: `
        import { createServerFn, createMiddleware, createStartModule } from '@tanstack/react-start'
      `,
      errors: [
        { messageId: 'useRouteScope', data: { name: 'createServerFn' } },
        { messageId: 'useRouteScope', data: { name: 'createMiddleware' } },
        { messageId: 'useRouteScope', data: { name: 'createStartModule' } },
      ],
    },
  ],
})
