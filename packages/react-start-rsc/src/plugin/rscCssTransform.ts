import { cloneGeneratedNode, unwrapExpression } from '@tanstack/router-utils'
import { is } from 'yuku-ast'
import type {
  StartCompilerImportTransform,
  StartCompilerTransformContext,
} from '@tanstack/start-plugin-core'

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'
const RSC_CSS_OPTIONS_KEY = '__tanstackStartRscCss'

type CompilerExpression = ReturnType<
  StartCompilerTransformContext['parseExpression']
>

type RscCssTransformKind =
  | 'renderServerComponent'
  | 'createCompositeComponent'
  | 'renderToReadableStream'

export function createRscCssCompilerTransforms(opts: {
  loadCssExpression: string
  serverFnProviderOnly?: boolean | undefined
}): Array<StartCompilerImportTransform> {
  let loadCssExpression: CompilerExpression | undefined

  const getLoadCssExpression = (context: StartCompilerTransformContext) => {
    loadCssExpression ??= context.parseExpression(opts.loadCssExpression)
    return loadCssExpression
  }

  return [
    createRscCssCompilerTransform({
      serverFnProviderOnly: opts.serverFnProviderOnly,
      getLoadCssExpression,
      kind: 'renderServerComponent',
      name: 'react-rsc-render-server-component-css',
    }),
    createRscCssCompilerTransform({
      serverFnProviderOnly: opts.serverFnProviderOnly,
      getLoadCssExpression,
      kind: 'createCompositeComponent',
      name: 'react-rsc-create-composite-component-css',
    }),
    createRscCssCompilerTransform({
      serverFnProviderOnly: opts.serverFnProviderOnly,
      getLoadCssExpression,
      kind: 'renderToReadableStream',
      name: 'react-rsc-render-to-readable-stream-css',
    }),
  ]
}

function createRscCssCompilerTransform(opts: {
  name: string
  kind: RscCssTransformKind
  getLoadCssExpression: (
    context: StartCompilerTransformContext,
  ) => CompilerExpression
  serverFnProviderOnly?: boolean | undefined
}): StartCompilerImportTransform {
  return {
    name: opts.name,
    environment: 'server',
    imports: [
      {
        libName: '@tanstack/react-start/rsc',
        rootExport: opts.kind,
      },
      {
        libName: '@tanstack/react-start-rsc',
        rootExport: opts.kind,
      },
    ],
    detect: new RegExp(`\\b${opts.kind}\\b`),
    transform: (candidates, context) => {
      if (
        opts.serverFnProviderOnly &&
        !context.id.includes(TSS_SERVERFN_SPLIT_PARAM)
      ) {
        return
      }

      const loadCssExpression = opts.getLoadCssExpression(context)
      const cloneLoadCssExpression = () => cloneGeneratedNode(loadCssExpression)

      for (const candidate of candidates) {
        const args = candidate.node.arguments
        if (args.length !== 1) {
          continue
        }

        if (opts.kind === 'renderToReadableStream') {
          const firstArg = args[0]
          if (!firstArg || is.SpreadElement(firstArg)) {
            continue
          }
          if (!isTopLevelJsx(firstArg)) {
            continue
          }

          args[0] = createCssFragment(
            context,
            firstArg,
            cloneLoadCssExpression(),
          ) as typeof firstArg
          continue
        }

        const options = context.parseExpression(
          `{ ${RSC_CSS_OPTIONS_KEY}: null }`,
        )
        if (
          is.ObjectExpression(options) &&
          is.Property(options.properties[0])
        ) {
          options.properties[0].value = cloneLoadCssExpression()
          args.push(options)
        }
      }
    },
  }
}

function isTopLevelJsx(expr: CompilerExpression): boolean {
  const unwrapped = unwrapExpression(expr)
  return is.JSXElement(unwrapped) || is.JSXFragment(unwrapped)
}

function createCssFragment(
  context: StartCompilerTransformContext,
  original: CompilerExpression,
  loadCssExpression: CompilerExpression,
) {
  const fragment = context.parseExpression('<>{null}{null}</>')
  if (
    !is.JSXFragment(fragment) ||
    !is.JSXExpressionContainer(fragment.children[0]) ||
    !is.JSXExpressionContainer(fragment.children[1])
  ) {
    throw new Error('Expected compiler fragment')
  }
  fragment.children[0].expression = loadCssExpression
  const unwrapped = unwrapExpression(original)
  if (is.JSXElement(unwrapped) || is.JSXFragment(unwrapped)) {
    fragment.children[1] = unwrapped
  } else {
    fragment.children[1].expression = original
  }
  return fragment
}
