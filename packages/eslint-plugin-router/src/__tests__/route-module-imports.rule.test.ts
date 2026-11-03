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
        import { Outlet, notFound, createSerializationAdapter } from '@tanstack/react-router'
        import { createMiddleware, useServerFn } from '@tanstack/react-start'
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
    {
      name: 'generated files',
      filename: generatedFile,
      code: `
        import { createServerFn as createStartServerFn } from '@tanstack/react-start'
      `,
    },
  ],
  invalid: [
    {
      name: 'routing APIs from the framework package',
      filename: moduleFile,
      code: `
        import { createFileRoute, Link as RouterLink, Outlet } from '@tanstack/react-router'
        import { useNavigate } from '@tanstack/vue-router'
      `,
      errors: [
        { messageId: 'useRouteScope', data: { name: 'createFileRoute' } },
        { messageId: 'useRouteScope', data: { name: 'Link' } },
        { messageId: 'useRouteScope', data: { name: 'useNavigate' } },
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
        import { createServerFn, createStartModule } from '@tanstack/react-start'
      `,
      errors: [
        { messageId: 'useRouteScope', data: { name: 'createServerFn' } },
        { messageId: 'useRouteScope', data: { name: 'createStartModule' } },
      ],
    },
  ],
})
