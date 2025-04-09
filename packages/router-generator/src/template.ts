import { format } from './utils'
import type { Config } from './config'

type TemplateTag = 'tsrImports' | 'tsrPath' | 'tsrExportStart' | 'tsrExportEnd'

export function fillTemplate(
  config: Config,
  template: string,
  values: Record<TemplateTag, string>,
) {
  const replaced = template.replace(
    /%%(\w+)%%/g,
    (_, key) => values[key as TemplateTag] || '',
  )
  return format(replaced, config)
}

type TargetTemplate = {
  fullPkg: string
  subPkg: string
  rootRoute: {
    template: () => string
    imports: {
      tsrImports: () => string
      tsrExportStart: () => string
      tsrExportEnd: () => string
    }
  }
  route: {
    template: () => string
    imports: {
      tsrImports: () => string
      tsrExportStart: (routePath: string) => string
      tsrExportEnd: () => string
    }
  }
  lazyRoute: {
    template: () => string
    imports: {
      tsrImports: () => string
      tsrExportStart: (routePath: string) => string
      tsrExportEnd: () => string
    }
  }
}

export function getTargetTemplate(target: Config['target']): TargetTemplate {
  switch (target) {
    // TODO: Remove this disabled eslint rule when more target types are added.

    case 'react':
      return {
        fullPkg: '@tanstack/react-router',
        subPkg: 'react-router',
        rootRoute: {
          template: () =>
            [
              'import * as React from "react"\n',
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
              'function RootComponent() { return (<React.Fragment><div>Hello "%%tsrPath%%"!</div><Outlet /></React.Fragment>) };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { Outlet, createRootRoute } from '@tanstack/react-router';",
            tsrExportStart: () => 'export const Route = createRootRoute(',
            tsrExportEnd: () => ');',
          },
        },
        route: {
          template: () =>
            [
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
              'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { createFileRoute } from '@tanstack/react-router';",
            tsrExportStart: (routePath) =>
              `export const Route = createFileRoute('${routePath}')(`,
            tsrExportEnd: () => ');',
          },
        },
        lazyRoute: {
          template: () =>
            [
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
              'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { createLazyFileRoute } from '@tanstack/react-router';",
            tsrExportStart: (routePath) =>
              `export const Route = createLazyFileRoute('${routePath}')(`,
            tsrExportEnd: () => ');',
          },
        },
      }
    case 'solid':
      return {
        fullPkg: '@tanstack/solid-router',
        subPkg: 'solid-router',
        rootRoute: {
          template: () =>
            [
              'import * as Solid from "solid-js"\n',
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
              'function RootComponent() { return (<><div>Hello "%%tsrPath%%"!</div><Outlet /></>) };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { Outlet, createRootRoute } from '@tanstack/solid-router';",
            tsrExportStart: () => 'export const Route = createRootRoute(',
            tsrExportEnd: () => ');',
          },
        },
        route: {
          template: () =>
            [
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
              'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { createFileRoute } from '@tanstack/solid-router';",
            tsrExportStart: (routePath) =>
              `export const Route = createFileRoute('${routePath}')(`,
            tsrExportEnd: () => ');',
          },
        },
        lazyRoute: {
          template: () =>
            [
              '%%tsrImports%%',
              '\n\n',
              '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
              'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
            ].join(''),
          imports: {
            tsrImports: () =>
              "import { createLazyFileRoute } from '@tanstack/solid-router';",
            tsrExportStart: (routePath) =>
              `export const Route = createLazyFileRoute('${routePath}')(`,
            tsrExportEnd: () => ');',
          },
        },
      }
    default:
      throw new Error(`router-generator: Unknown target type: ${target}`)
  }
}

export const defaultAPIRouteTemplate = [
  'import { json } from "@tanstack/react-start";\n',
  '%%tsrImports%%',
  '\n\n',
  '%%tsrExportStart%%{ GET: ({ request, params }) => { return json({ message:\'Hello "%%tsrPath%%"!\' }) }}%%tsrExportEnd%%\n',
].join('')
