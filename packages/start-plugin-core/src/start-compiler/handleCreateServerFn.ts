import { b, is } from 'yuku-ast'
import { parseExpression, parseStatements } from '@tanstack/router-utils'
import path from 'pathe'
import {
  cleanId,
  codeFrameError,
  getVariableDeclarator,
  sourcePosition,
  stripMethodCall,
} from './utils'
import type { Program, ProgramStatement } from '@yuku-toolchain/types'
import type { CompilationContext, RewriteCandidate, ServerFn } from './types'

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'

export function handleCreateServerFn(
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
) {
  if (candidates.length === 0) {
    return
  }
  const isProvider = context.id.includes(TSS_SERVERFN_SPLIT_PARAM)
  const runtime = isProvider
    ? 'provider'
    : context.env === 'client'
      ? 'client'
      : 'ssr'
  const runtimeName =
    runtime === 'provider'
      ? 'createServerRpc'
      : runtime === 'client'
        ? 'createClientRpc'
        : 'createSsrRpc'
  const functionNames = new Set<string>()
  const exportNames = new Set<string>()
  const serverFnsById: Record<string, ServerFn> = {}
  const [baseFilename] = context.id.split('?') as [string]
  const extractedFilename = `${baseFilename}?${TSS_SERVERFN_SPLIT_PARAM}`
  const relativeFilename = path.relative(context.root, baseFilename)
  const knownFns = context.getKnownServerFns()

  for (const { node, methodChain } of candidates) {
    const declarator = getVariableDeclarator(node, context.parentOf)
    if (!declarator) {
      throw new Error('createServerFn must be assigned to a variable!')
    }
    if (!is.Identifier(declarator.id)) {
      throw codeFrameError(
        context.code,
        declarator.id,
        'createServerFn must be assigned to a simple identifier, not a destructuring pattern',
      )
    }
    const variableName = declarator.id.name
    let functionName = `${variableName}_createServerFn_handler`
    while (functionNames.has(functionName)) {
      functionName = incrementFunctionNameVersion(functionName)
    }
    functionNames.add(functionName)
    const functionId = context.generateFunctionId({
      filename: relativeFilename,
      functionName,
      extractedFilename,
    })
    const knownFn = knownFns[functionId]
    if (methodChain.inputValidator) {
      const location = sourcePosition(
        context.code,
        methodChain.inputValidator.call.start,
      )
      context.warn?.(
        `${context.id}:${location.line}:${location.column + 1} createServerFn().inputValidator() is deprecated. Use createServerFn().validator() instead.`,
      )
    }
    for (const [name, method] of [
      ['validator', methodChain.validator],
      ['inputValidator', methodChain.inputValidator],
    ] as const) {
      if (!method) {
        continue
      }
      if (!method.call.arguments[0]) {
        throw new Error(
          `createServerFn().${name}() must be called with a validator!`,
        )
      }
      if (context.env === 'client') {
        stripMethodCall(method.call, context)
      }
    }
    const handler = methodChain.handler
    if (!handler?.firstArg) {
      throw codeFrameError(
        context.code,
        node.callee,
        'createServerFn must be called with a "handler" property!',
      )
    }
    if (!is.Expression(handler.firstArg)) {
      throw codeFrameError(
        context.code,
        handler.firstArg,
        `handler() must be called with an expression, not a ${handler.firstArg.type}`,
      )
    }
    if (!isProvider) {
      serverFnsById[functionId] = {
        functionName,
        functionId,
        filename: cleanId(context.id),
        extractedFilename: knownFn?.extractedFilename ?? extractedFilename,
        isClientReferenced:
          context.env === 'client' || !!knownFn || runtime === 'ssr',
      }
      context.replaceNode(
        handler.firstArg,
        parseExpression(`${runtimeName}(${JSON.stringify(functionId)})`),
      )
      continue
    }
    const declaration = context.parentOf(declarator)
    if (!is.VariableDeclaration(declaration)) {
      throw new Error('Expected createServerFn to be in a VariableDeclaration')
    }
    const parent = context.parentOf(declaration)
    const statement = is.ExportNamedDeclaration(parent) ? parent : declaration
    const container = is.ExportNamedDeclaration(parent)
      ? context.parentOf(parent)
      : parent
    if (!is.Program(container) && !is.BlockStatement(container)) {
      throw new Error('Expected createServerFn declaration in a statement list')
    }
    const statements: Array<ProgramStatement> = container.body
    const statementIndex = statements.indexOf(statement)
    const metadata = JSON.stringify({
      id: functionId,
      name: variableName,
      filename: relativeFilename,
    })
    const extracted = parseStatements(
      `const ${functionName} = createServerRpc(${metadata}, (opts) => ${variableName}.__executeServer(opts));`,
    )[0]!
    statements.splice(statementIndex, 0, extracted)
    // Move the existing handler node; its source-binding identity remains intact.
    handler.call.arguments = [parseExpression(functionName), handler.firstArg]
    exportNames.add(functionName)
  }

  if (isProvider) {
    removeExports(context.ast)
    if (exportNames.size) {
      context.ast.body.push(
        b.ExportNamedDeclaration({
          declaration: null,
          source: null,
          attributes: [],
          exportKind: 'value',
          specifiers: [...exportNames].map((name) =>
            b.ExportSpecifier({
              local: b.Identifier({ name }),
              exported: b.Identifier({ name }),
              exportKind: 'value',
            }),
          ),
        }),
      )
    }
    if (context.mode === 'dev') {
      context.ast.body.push(
        ...parseStatements(
          'if (import.meta.hot) { import.meta.hot.accept(() => {}); } if (import.meta.webpackHot) { import.meta.webpackHot.accept(() => {}); }',
        ),
      )
    }
    const existing = new Set(
      context.ast.body.filter(is.Directive).map((node) => node.directive),
    )
    const missing = (context.serverFnProviderModuleDirectives ?? []).filter(
      (directive) => {
        if (!directive || existing.has(directive)) {
          return false
        }
        existing.add(directive)
        return true
      },
    )
    context.ast.body.unshift(
      ...parseStatements(
        missing.map((directive) => `${JSON.stringify(directive)};`).join('\n'),
      ),
    )
  } else if (Object.keys(serverFnsById).length) {
    context.onServerFnsById?.(serverFnsById)
  }
  let importIndex = 0
  while (is.Directive(context.ast.body[importIndex])) {
    importIndex++
  }
  const importPath = runtime === 'provider' ? 'server-rpc' : `${runtime}-rpc`
  context.ast.body.splice(
    importIndex,
    0,
    ...parseStatements(
      `import { ${runtimeName} } from '@tanstack/${context.framework}-start/${importPath}';`,
    ),
  )
}

function incrementFunctionNameVersion(name: string): string {
  const [base, count] = name.split(/_(\d+)$/)
  return (
    base!
      .replace(/[^a-zA-Z0-9_$]/g, '_')
      .replace(/^[0-9]/, '_$&')
      .replace(/^\$/, '_$')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '') + `_${Number(count || '0') + 1}`
  )
}

function removeExports(program: Program) {
  program.body = program.body.flatMap<ProgramStatement>((node) => {
    if (is.ExportNamedDeclaration(node) || is.ExportDefaultDeclaration(node)) {
      if (
        is.FunctionDeclaration(node.declaration) ||
        is.ClassDeclaration(node.declaration)
      ) {
        return node.declaration.id ? [node.declaration] : [node]
      }
      if (is.VariableDeclaration(node.declaration)) {
        return [node.declaration]
      }
      if (!node.declaration) {
        return []
      }
    }
    return [node]
  })
}
