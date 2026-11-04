import { lit } from '../print/style'
import type { CodeStyle } from '../print/style'
import type { Config } from '../config'

export type ScaffoldKind = 'root' | 'route' | 'lazy'

export interface ScaffoldOptions {
  target: Config['target']
  kind: ScaffoldKind
  /** The route id (`__root` for the root route). */
  routeId: string
  /** Whether the file is TypeScript without JSX (`.ts`, `.mts`, `.cts`). */
  noJsx: boolean
  style: CodeStyle
  /** A `customScaffolding` template (`%%tag%%` placeholders), used as written. */
  template?: string
}

type TemplateTag = 'tsrImports' | 'tsrPath' | 'tsrExportStart' | 'tsrExportEnd'

export function routerPackageOf(target: Config['target']) {
  switch (target) {
    case 'react':
    case 'solid':
    case 'vue':
      return `@tanstack/${target}-router`
    default:
      throw new Error(`router-generator: Unknown target type: ${target}`)
  }
}

/**
 * The content of a new, empty route file (SPEC J1.3): a working route of
 * its target and kind, in the configured quote style and semicolons. A
 * `.ts` file gets no JSX. A custom template is filled in as written.
 */
export function scaffoldRouteFile(options: ScaffoldOptions): string {
  const { style, kind, routeId } = options
  const q = (value: string) => lit(value, style.quote)
  const semi = style.semicolons ? ';' : ''
  const routerPackage = routerPackageOf(options.target)
  const constructor =
    kind === 'root'
      ? 'createRootRoute'
      : kind === 'lazy'
        ? 'createLazyFileRoute'
        : 'createFileRoute'
  const routerImports =
    kind === 'root' ? ['Outlet', constructor] : [constructor]
  // The path as shown by the page (braces of optional params read badly in
  // text, and are not valid in JSX text)
  const shownPath = routeId.replace(/\{(.+?)\}/g, '$1')
  const tags: Record<string, string | undefined> & Record<TemplateTag, string> =
    {
      tsrImports: `import { ${routerImports.join(', ')} } from ${q(routerPackage)}${semi}`,
      tsrPath: shownPath,
      tsrExportStart:
        kind === 'root'
          ? `export const Route = ${constructor}(`
          : `export const Route = ${constructor}(${q(routeId)})(`,
      tsrExportEnd: `)${semi}`,
    }

  if (options.template !== undefined) {
    return options.template.replace(
      /%%(\w+)%%/g,
      (_, tag: string) => tags[tag] ?? '',
    )
  }

  const component = kind === 'root' ? 'RootComponent' : 'RouteComponent'
  const text = `Hello "${shownPath}"!`
  const { imports, body } = componentOf(
    options.target,
    kind === 'root',
    options.noJsx,
    text,
    q,
    semi,
  )
  return [
    ...imports.map((specifierAndSource) => `${specifierAndSource}${semi}`),
    tags.tsrImports,
    '',
    `${tags.tsrExportStart}{`,
    `  component: ${component},`,
    `}${tags.tsrExportEnd}`,
    '',
    `function ${component}() {`,
    ...body,
    '}',
    '',
  ].join('\n')
}

function componentOf(
  target: Config['target'],
  isRoot: boolean,
  noJsx: boolean,
  text: string,
  q: (value: string) => string,
  semi: string,
): { imports: Array<string>; body: Array<string> } {
  if (target === 'vue') {
    return {
      imports: [`import { h } from ${q('vue')}`],
      body: [
        isRoot
          ? `  return h(${q('div')}, {}, [${q(text)}, h(Outlet)])${semi}`
          : `  return h(${q('div')}, {}, ${q(text)})${semi}`,
      ],
    }
  }
  if (noJsx) {
    if (target === 'react') {
      return {
        imports: [`import * as React from ${q('react')}`],
        body: isRoot
          ? [
              `  return React.createElement(`,
              `    React.Fragment,`,
              `    null,`,
              `    React.createElement(${q('div')}, null, ${q(text)}),`,
              `    React.createElement(Outlet),`,
              `  )${semi}`,
            ]
          : [
              `  return React.createElement(${q('div')}, null, ${q(text)})${semi}`,
            ],
      }
    }
    return {
      imports: isRoot
        ? [`import { createComponent } from ${q('solid-js')}`]
        : [],
      body: isRoot
        ? [`  return [${q(text)}, createComponent(Outlet, {})]${semi}`]
        : [`  return ${q(text)}${semi}`],
    }
  }
  if (target === 'react') {
    return {
      imports: isRoot ? [`import * as React from ${q('react')}`] : [],
      body: isRoot
        ? [
            '  return (',
            '    <React.Fragment>',
            `      <div>${text}</div>`,
            '      <Outlet />',
            '    </React.Fragment>',
            `  )${semi}`,
          ]
        : [`  return <div>${text}</div>${semi}`],
    }
  }
  return {
    imports: [],
    body: isRoot
      ? [
          '  return (',
          '    <>',
          `      <div>${text}</div>`,
          '      <Outlet />',
          '    </>',
          `  )${semi}`,
        ]
      : [`  return <div>${text}</div>${semi}`],
  }
}
