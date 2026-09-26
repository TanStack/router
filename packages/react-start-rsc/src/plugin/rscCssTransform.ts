import { cloneGeneratedNode } from '@tanstack/router-utils'
import type {
  StartCompilerImportTransform,
  StartCompilerTransformContext,
} from '@tanstack/start-plugin-core'

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'
const RSC_CSS_OPTIONS_KEY = '__tanstackStartRscCss'

type NativeExpression = ReturnType<
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
  let loadCssExpression: NativeExpression | undefined

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
  ) => NativeExpression
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
          if (!firstArg || firstArg.type === 'SpreadElement') {
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
          options.type === 'ObjectExpression' &&
          options.properties[0]?.type === 'Property'
        ) {
          options.properties[0].value = cloneLoadCssExpression()
          args.push(options)
        }
      }
    },
  }
}

function isTopLevelJsx(expr: NativeExpression): boolean {
  const unwrapped = unwrapTransparentExpression(expr)
  return unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment'
}

function unwrapTransparentExpression(expr: NativeExpression): NativeExpression {
  let current = expr
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression'
  ) {
    current = current.expression
  }
  return current
}

function createCssFragment(
  context: StartCompilerTransformContext,
  original: NativeExpression,
  loadCssExpression: NativeExpression,
) {
  const fragment = context.parseExpression('<>{null}{null}</>')
  if (
    fragment.type !== 'JSXFragment' ||
    fragment.children[0]?.type !== 'JSXExpressionContainer' ||
    fragment.children[1]?.type !== 'JSXExpressionContainer'
  ) {
    throw new Error('Expected compiler fragment')
  }
  fragment.children[0].expression = loadCssExpression
  const unwrapped = unwrapTransparentExpression(original)
  if (unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment') {
    fragment.children[1] = unwrapped
  } else {
    fragment.children[1].expression = original
  }
  return fragment
}
