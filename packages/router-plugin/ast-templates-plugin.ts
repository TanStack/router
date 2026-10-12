import {
  analyzeModule,
  generateModule,
  sourcePosition,
} from '@tanstack/router-utils'
import { BindingFlags } from 'yuku-analyzer'
import { b, is, isValidIdentifier } from 'yuku-ast'
import type { Binding } from 'yuku-analyzer'
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  Node,
  ObjectExpression,
  ObjectProperty,
  SpreadElement,
  StringLiteral,
  TSAsExpression,
  TSInstantiationExpression,
  TSNonNullExpression,
  TSSatisfiesExpression,
  TSTypeAssertion,
} from '@yuku-toolchain/types'
import type { Plugin } from 'vite'

/**
 * Compiles the `astTemplate` calls of the router plugin's sources (see
 * `src/core/ast-template.ts`) into the `yuku-ast` builder calls that create
 * their trees, for the package build and for Vitest.
 */
export function astTemplatesPlugin(): Plugin {
  return {
    name: 'tanstack-router-plugin:ast-templates',
    enforce: 'pre',
    transform: {
      filter: { id: /\.ts$/, code: 'astTemplate' },
      handler(code, id) {
        try {
          return compileAstTemplates(code, id)
        } catch (error) {
          if (error instanceof TemplateError) {
            // Vite prints the frame under the message
            this.error({ message: error.message, frame: error.frame })
          }
          throw error
        }
      },
    },
  }
}

export class TemplateError extends Error {
  /** The template source around the error */
  frame: string

  constructor(message: string, frame: string) {
    super(message)
    this.name = 'TemplateError'
    this.frame = frame
  }
}

type HoleKind =
  | 'expression'
  | 'identifier'
  | 'literal'
  | 'statements'
  | 'binding'

const holeKinds: Array<HoleKind> = [
  'expression',
  'identifier',
  'literal',
  'statements',
  'binding',
]

interface Hole {
  name: string
  kind: HoleKind
  exported: boolean
  /** The property declaring it */
  node: Node
  uses: number
}

const apiModule = /(?:^|\/)ast-template(?:\.[jt]s)?$/
const apiNames = new Set(['astTemplate', 'hole', 'importMeta'])

/**
 * The module with its templates compiled, printed with a source map, or
 * `null` without templates. Throws a `TemplateError` for a misused template.
 */
export function compileAstTemplates(code: string, id: string) {
  const module = analyzeModule({ code, filename: id })
  const fail = (node: Pick<Node, 'start' | 'end'>, message: string): never => {
    const { line, column } = sourcePosition(code, node.start)
    throw new TemplateError(
      `${id}:${line}:${column + 1}: ${message}`,
      codeFrame(code, node),
    )
  }

  const apiImports = module.imports.filter(
    (record) =>
      !record.typeOnly &&
      record.kind === 'named' &&
      apiModule.test(record.specifier),
  )
  const apiBinding = (name: string) =>
    apiImports.find((record) => record.name === name)?.local ?? undefined
  const astTemplate = apiBinding('astTemplate')
  if (!astTemplate) {
    return null
  }
  const holeApi = apiBinding('hole')
  const importMeta = apiBinding('importMeta')

  const calls: Array<CallExpression> = []
  for (const reference of astTemplate.references) {
    const call = module.parentOf(reference.node)
    if (!is.CallExpression(call) || call.callee !== reference.node) {
      return fail(reference.node, 'call `astTemplate` directly')
    }
    calls.push(call)
  }
  for (const binding of [holeApi, importMeta]) {
    for (const reference of binding?.references ?? []) {
      if (!calls.some((call) => isInside(reference.node, call))) {
        fail(reference.node, `\`${reference.name}\` only exists in templates`)
      }
    }
  }

  // Names the compiled templates import, without shadowing a module binding
  const imported = new Map<string, string>()
  const importedName = (name: string, from: 'yuku-ast' | 'api') => {
    let local = imported.get(name)
    if (!local) {
      local =
        module.imports.find(
          (record) =>
            !record.typeOnly &&
            record.name === name &&
            (from === 'api'
              ? apiModule.test(record.specifier)
              : record.specifier === from),
        )?.local?.name ?? freeName(name)
      imported.set(name, local)
    }
    return local
  }
  const freeName = (name: string) => {
    let local = name
    for (let suffix = 2; isTaken(local); suffix++) {
      local = `${name}${suffix}`
    }
    return local
  }
  const isTaken = (name: string) =>
    module.rootScope.find(name) !== null ||
    module.unresolvedReferences.some((reference) => reference.name === name) ||
    [...imported.values()].includes(name)

  const builders = calls.map((call) => [call, compileTemplate(call)] as const)
  for (const [call, builder] of builders) {
    replaceChild(module.parentOf(call)!, call, builder)
  }
  updateImports()

  const output = generateModule(module.ast, { source: code, filename: id })
  return { code: output.code, map: output.map }

  function compileTemplate(call: CallExpression): ArrowFunctionExpression {
    const [spec, arrow, ...rest] = call.arguments
    if (!is.ObjectExpression(spec) || !is.ArrowFunctionExpression(arrow)) {
      return fail(
        call,
        'astTemplate takes an object of holes and an arrow function',
      )
    }
    const template: ArrowFunctionExpression = arrow
    if (rest.length || call.typeArguments) {
      fail(call, 'astTemplate infers its type arguments from its two arguments')
    }
    if (template.async || template.typeParameters) {
      fail(template, 'a template is a plain arrow function')
    }
    const holes = readHoles(spec)
    const holeOf = new Map<Binding, Hole>()

    const [parameter, ...otherParameters] = template.params
    if (otherParameters.length) {
      fail(otherParameters[0]!, 'a template takes one parameter: its holes')
    }
    if (parameter) {
      if (!is.ObjectPattern(parameter)) {
        return fail(parameter, 'destructure the holes: `({ hole }) => ...`')
      }
      for (const property of parameter.properties) {
        if (
          !is.Property(property) ||
          property.computed ||
          !is.Identifier(property.value)
        ) {
          return fail(property, 'destructure each hole into a variable')
        }
        const name = keyName(property.key)
        const hole = name === undefined ? undefined : holes.get(name)
        if (!hole) {
          return fail(
            property.key,
            `unknown hole \`${name}\`: declare it in the first argument`,
          )
        }
        if (hole.kind === 'binding') {
          fail(
            property.key,
            `\`${name}\` names a binding: declare it in the template instead`,
          )
        }
        holeOf.set(module.bindingOf(property.value)!, hole)
      }
    }

    // A binding hole names a declaration of the template's top level
    const declared = new Map<string, Binding>()
    if (is.BlockStatement(template.body)) {
      for (const statement of template.body.body) {
        for (const id of declaredIdentifiers(statement)) {
          declared.set(id.name, module.bindingOf(id)!)
        }
      }
    }
    for (const hole of holes.values()) {
      if (hole.kind === 'binding') {
        const binding = declared.get(hole.name)
        if (!binding) {
          return fail(
            hole.node,
            `declare \`${hole.name}\` at the top level of the template's statements`,
          )
        }
        holeOf.set(binding, hole)
      }
    }

    const holesName = 'holes'
    const holeValue = (hole: Hole) =>
      member(b.Identifier({ name: holesName }), hole.name)

    const body = is.BlockStatement(template.body)
      ? statementList(template.body.body, true)
      : emit(template.body)
    for (const hole of holes.values()) {
      if (!hole.uses) {
        fail(hole.node, `unused hole \`${hole.name}\``)
      }
    }
    return located(
      b.ArrowFunctionExpression({
        id: null,
        generator: false,
        async: false,
        params: holes.size ? [b.Identifier({ name: holesName })] : [],
        body,
        expression: true,
      }),
      call,
    )

    /** `[...]` for a statement list, with statement holes spread in. */
    function statementList(
      statements: Array<Node>,
      topLevel = false,
    ): Expression {
      const elements: Array<Expression | SpreadElement> = []
      for (const statement of statements) {
        // Type declarations, and the `;` prettier leads `(a)()` with
        if (
          is.EmptyStatement(statement) ||
          is.TSTypeAliasDeclaration(statement) ||
          is.TSInterfaceDeclaration(statement)
        ) {
          continue
        }
        if (topLevel && is.ReturnStatement(statement)) {
          fail(statement, 'a statements template cannot return')
        }
        const statementsHole = holeCalledBy(statement)
        if (statementsHole) {
          statementsHole.uses++
          elements.push(
            located(
              b.SpreadElement({ argument: holeValue(statementsHole) }),
              statement,
            ),
          )
          continue
        }
        const exported = topLevel
          ? declaredIdentifiers(statement).some((id) => holeAt(id)?.exported)
          : false
        elements.push(
          exported
            ? builderCall('ExportNamedDeclaration', statement, [
                ['declaration', emit(statement)],
                ['specifiers', b.ArrayExpression({ elements: [] })],
                ['source', nullLiteral()],
                ['attributes', b.ArrayExpression({ elements: [] })],
                ['exportKind', string('value')],
              ])
            : emit(statement),
        )
      }
      return b.ArrayExpression({ elements })
    }

    /** The statements hole `statement` calls: `hole()` */
    function holeCalledBy(statement: Node) {
      if (
        !is.ExpressionStatement(statement) ||
        !is.CallExpression(statement.expression) ||
        !is.Identifier(statement.expression.callee)
      ) {
        return undefined
      }
      const call = statement.expression
      const hole = holeAt(call.callee as Identifier)
      if (hole?.kind !== 'statements') {
        return undefined
      }
      if (call.arguments.length || call.optional) {
        fail(call, `call \`${hole.name}\` without arguments`)
      }
      return hole
    }

    /** The hole an identifier references or declares */
    function holeAt(identifier: Identifier) {
      const binding =
        module.referenceOf(identifier)?.binding ?? module.bindingOf(identifier)
      return binding ? holeOf.get(binding) : undefined
    }

    /** The builder calls that create `node`. */
    function emit(node: Node): Expression {
      if (is.Identifier(node)) {
        return identifier(node)
      }
      // The printer adds the parentheses precedence needs
      if (isTypeAssertion(node) || is.ParenthesizedExpression(node)) {
        return emit(node.expression)
      }
      if (is.Property(node) && node.shorthand && is.Identifier(node.value)) {
        // `{ name }` stays shorthand while the value keeps the name
        const value = emit(node.value)
        return builderCall('Property', node, [
          ['kind', string(node.kind)],
          ['key', plainIdentifier(node.key as Identifier)],
          ['value', value],
          ['method', boolean(false)],
          ['shorthand', boolean(keepsName(value, node.value.name))],
          ['computed', boolean(false)],
        ])
      }
      if (
        is.Literal(node) &&
        node.value !== null &&
        !['string', 'number', 'boolean'].includes(typeof node.value)
      ) {
        fail(
          node,
          'only string, number, boolean and null literals are supported',
        )
      }
      if (node.type.startsWith('TS') || node.type.startsWith('JSX')) {
        fail(
          node,
          `\`${node.type}\` has no place in the JavaScript a template builds`,
        )
      }
      return builderCall(node.type, node, fieldsOf(node))
    }

    function fieldsOf(node: Node) {
      const fields: Array<[string, Expression]> = []
      for (const [key, value] of Object.entries(node)) {
        // Comments document the template, not the route module
        if (
          key === 'type' ||
          key === 'start' ||
          key === 'end' ||
          key === 'comments' ||
          isDefaultField(node, key, value)
        ) {
          continue
        }
        if (statementLists.has(`${node.type}.${key}`)) {
          fields.push([key, statementList(value as Array<Node>)])
        } else if (Array.isArray(value)) {
          fields.push([
            key,
            b.ArrayExpression({
              elements: value.map((item: Node | null) =>
                item === null ? nullLiteral() : emit(item),
              ),
            }),
          ])
        } else if (isNode(value)) {
          fields.push([key, emit(value)])
        } else {
          // Including a template element's `{ raw, cooked }`
          fields.push([key, data(value)])
        }
      }
      return fields
    }

    function identifier(node: Identifier): Expression {
      const reference = module.referenceOf(node)
      const hole = holeAt(node)
      if (!reference) {
        // A declaration or a property name
        if (hole) {
          hole.uses++
          return builderCall('Identifier', node, [['name', holeValue(hole)]])
        }
        return plainIdentifier(node)
      }
      const { binding } = reference
      if (hole) {
        hole.uses++
        switch (hole.kind) {
          case 'expression':
            // Another use builds another tree
            return located(
              hole.uses === 1
                ? holeValue(hole)
                : helper('copy', holeValue(hole)),
              node,
            )
          case 'identifier':
            return located(helper('reference', holeValue(hole)), node)
          case 'literal':
            return located(helper('literal', holeValue(hole)), node)
          case 'binding':
            return builderCall('Identifier', node, [['name', holeValue(hole)]])
          case 'statements':
            return fail(
              node,
              `\`${hole.name}\` holds statements: call it as a statement, \`${node.name}()\``,
            )
        }
      }
      if (binding && binding === importMeta) {
        return builderCall('MetaProperty', node, [
          ['meta', plainIdentifier({ ...node, name: 'import' })],
          ['property', plainIdentifier({ ...node, name: 'meta' })],
        ])
      }
      if (binding && isInside(binding.declarations[0]!, template)) {
        return plainIdentifier(node)
      }
      if (!binding || binding.has(BindingFlags.Ambient)) {
        // A global, or a binding of the route module
        return located(helper('reference', string(node.name)), node)
      }
      return fail(
        node,
        `\`${node.name}\` is a binding of the template module, but templates run in route modules: use a hole, or \`declare\` the route module's binding`,
      )
    }
  }

  function readHoles(spec: ObjectExpression) {
    const holes = new Map<string, Hole>()
    for (const property of spec.properties) {
      const name =
        is.Property(property) && !property.computed
          ? keyName(property.key)
          : undefined
      if (name === undefined || !isValidIdentifier(name)) {
        return fail(property, 'declare each hole as `name: hole.kind()`')
      }
      const value = (property as ObjectProperty).value
      const kind =
        is.CallExpression(value) &&
        is.MemberExpression(value.callee) &&
        !value.callee.computed &&
        is.Identifier(value.callee.object) &&
        holeApi !== undefined &&
        module.referenceOf(value.callee.object)?.binding === holeApi
          ? (keyName(value.callee.property) as HoleKind)
          : undefined
      if (!kind || !holeKinds.includes(kind)) {
        return fail(
          value,
          `declare the hole with \`hole.${holeKinds.join('()`, `hole.')}()\``,
        )
      }
      const args = (value as CallExpression).arguments
      let exported = false
      if (kind === 'binding' && args.length) {
        const [options] = args
        const option = is.ObjectExpression(options)
          ? options.properties[0]
          : undefined
        if (
          !is.ObjectExpression(options) ||
          options.properties.length !== 1 ||
          !is.Property(option) ||
          keyName(option.key) !== 'exported' ||
          !is.Literal(option.value) ||
          typeof option.value.value !== 'boolean'
        ) {
          return fail(
            options ?? value,
            'the options of a binding are `{ exported }`',
          )
        }
        exported = (option.value as { value: boolean }).value
      } else if (args.length) {
        fail(value, `\`hole.${kind}\` takes no arguments`)
      }
      if (holes.has(name)) {
        fail(property, `duplicate hole \`${name}\``)
      }
      holes.set(name, { name, kind, exported, node: property, uses: 0 })
    }
    return holes
  }

  /** A call of a runtime helper of the API module. */
  function helper(name: 'reference' | 'literal' | 'copy', arg: Expression) {
    return call(b.Identifier({ name: importedName(name, 'api') }), [arg])
  }

  /** `b.<type>({ ... })`, located at the template node it creates. */
  function builderCall(
    type: string,
    node: Pick<Node, 'start' | 'end'>,
    fields: Array<[string, Expression]>,
  ) {
    return located(
      call(
        member(b.Identifier({ name: importedName('b', 'yuku-ast') }), type),
        [
          b.ObjectExpression({
            properties: fields.map(([key, value]) => property(key, value)),
          }),
        ],
      ),
      node,
    )
  }

  function plainIdentifier(node: Identifier) {
    return builderCall('Identifier', node, [['name', string(node.name)]])
  }

  /** Swap the API's compile-time imports for the helpers the builders call. */
  function updateImports() {
    const declarations = new Set(
      apiImports.map(
        (record) => module.parentOf(record.node) as ImportDeclaration,
      ),
    )
    const [first] = declarations
    for (const declaration of declarations) {
      declaration.specifiers = declaration.specifiers.filter(
        (specifier) =>
          !is.ImportSpecifier(specifier) ||
          !apiNames.has(keyName(specifier.imported) ?? ''),
      )
    }
    for (const [name, local] of imported) {
      const from = name === 'b' ? 'yuku-ast' : 'api'
      const existing = module.imports.some(
        (record) =>
          !record.typeOnly &&
          record.name === name &&
          (from === 'api'
            ? apiModule.test(record.specifier)
            : record.specifier === from),
      )
      if (existing) {
        continue
      }
      if (from === 'api') {
        first!.specifiers.push(importSpecifier(name, local))
      } else {
        module.ast.body.unshift(
          b.ImportDeclaration({
            specifiers: [importSpecifier(name, local)],
            source: string('yuku-ast'),
            phase: null,
            attributes: [],
            importKind: 'value',
          }),
        )
      }
    }
    for (const declaration of declarations) {
      if (!declaration.specifiers.length) {
        module.ast.body.splice(module.ast.body.indexOf(declaration), 1)
      }
    }
  }
}

/** The names a statement declares in its scope. */
function declaredIdentifiers(statement: Node): Array<Identifier> {
  if (
    (is.FunctionDeclaration(statement) || is.ClassDeclaration(statement)) &&
    statement.id
  ) {
    return [statement.id]
  }
  if (is.VariableDeclaration(statement)) {
    return statement.declarations.flatMap((declarator) =>
      is.Identifier(declarator.id) ? [declarator.id] : [],
    )
  }
  return []
}

function replaceChild(parent: Node, child: Node, replacement: Node) {
  for (const [key, value] of Object.entries(parent)) {
    if (value === child) {
      ;(parent as unknown as Record<string, unknown>)[key] = replacement
      return
    }
    if (Array.isArray(value) && value.includes(child)) {
      value[value.indexOf(child)] = replacement
      return
    }
  }
  throw new Error('The template call is not a child of its parent')
}

function keyName(key: Node) {
  return is.Identifier(key)
    ? key.name
    : is.Literal(key) && typeof key.value === 'string'
      ? key.value
      : undefined
}

function isInside(node: Node, ancestor: Node) {
  return node.start >= ancestor.start && node.end <= ancestor.end
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

const typeAssertions = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
])

function isTypeAssertion(
  node: Node,
): node is
  | TSAsExpression
  | TSSatisfiesExpression
  | TSNonNullExpression
  | TSTypeAssertion
  | TSInstantiationExpression {
  return typeAssertions.has(node.type)
}

const statementLists = new Set([
  'BlockStatement.body',
  'SwitchCase.consequent',
  'StaticBlock.body',
])

/**
 * TypeScript fields, and optional fields at the value the builders leave out:
 * a compiled template builds the trees a person would write with `b`.
 */
function isDefaultField(node: Node, key: string, value: unknown) {
  switch (key) {
    case 'typeAnnotation':
    case 'typeArguments':
    case 'typeParameters':
    case 'returnType':
      return true
    case 'decorators':
      return Array.isArray(value) && value.length === 0
    case 'declare':
    case 'definite':
      return value === false
    case 'directive':
      return value === null
    case 'optional':
      // Optional chains keep it; elsewhere it marks an optional parameter
      return !is.MemberExpression(node) && !is.CallExpression(node)
    case 'value':
      return is.RestElement(node) && value === null
    default:
      return false
  }
}

/** Whether a compiled identifier keeps the name `name`. */
function keepsName(compiled: Expression, name: string) {
  if (!is.CallExpression(compiled)) {
    return false
  }
  const [argument] = compiled.arguments
  // reference('name')
  if (is.Literal(argument)) {
    return argument.value === name
  }
  // b.Identifier({ name: 'name' })
  const field = is.ObjectExpression(argument)
    ? argument.properties[0]
    : undefined
  return is.Property(field) && is.Literal(field.value)
    ? field.value.value === name
    : false
}

/** The generated code for a JSON value. */
function data(value: unknown): Expression {
  if (Array.isArray(value)) {
    return b.ArrayExpression({ elements: value.map(data) })
  }
  if (value !== null && typeof value === 'object') {
    return b.ObjectExpression({
      properties: Object.entries(value).map(([key, item]) =>
        property(key, data(item)),
      ),
    })
  }
  if (typeof value === 'string') {
    return string(value)
  }
  if (typeof value === 'boolean') {
    return boolean(value)
  }
  if (value === null) {
    return nullLiteral()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return b.Literal({ value, raw: String(value) })
  }
  throw new Error(`Unexpected value in a template tree: ${String(value)}`)
}

function located<T extends Node>(node: T, at: Pick<Node, 'start' | 'end'>) {
  node.start = at.start
  node.end = at.end
  return node
}

function call(callee: Expression, args: Array<Expression | SpreadElement>) {
  return b.CallExpression({ callee, arguments: args, optional: false })
}

function member(object: Expression, name: string) {
  return b.MemberExpression({
    object,
    property: b.Identifier({ name }),
    computed: false,
    optional: false,
  })
}

function property(key: string, value: Expression): ObjectProperty {
  return {
    type: 'Property',
    start: 0,
    end: 0,
    kind: 'init',
    key: isValidIdentifier(key) ? b.Identifier({ name: key }) : string(key),
    value,
    method: false,
    shorthand: false,
    computed: false,
  }
}

function importSpecifier(imported: string, local: string) {
  return b.ImportSpecifier({
    imported: b.Identifier({ name: imported }),
    local: b.Identifier({ name: local }),
    importKind: 'value',
  })
}

function string(value: string) {
  return b.Literal({ value, raw: JSON.stringify(value) }) as StringLiteral
}

function boolean(value: boolean) {
  return b.Literal({ value, raw: String(value) })
}

function nullLiteral() {
  return b.Literal({ value: null, raw: 'null' })
}

/** The lines around `node`, with its first line underlined. */
function codeFrame(code: string, node: Pick<Node, 'start' | 'end'>) {
  const lines = code.split(/\r\n|[\n\r\u2028\u2029]/)
  const start = sourcePosition(code, node.start)
  const end = sourcePosition(code, node.end)
  const first = Math.max(1, start.line - 2)
  const last = Math.min(lines.length, start.line + 2)
  const width = String(last).length
  const frame: Array<string> = []
  for (let line = first; line <= last; line++) {
    const text = lines[line - 1]!
    frame.push(
      `${line === start.line ? '>' : ' '} ${String(line).padStart(width)} | ${text}`.trimEnd(),
    )
    if (line === start.line) {
      const length =
        end.line === start.line
          ? end.column - start.column
          : text.length - start.column
      frame.push(
        `  ${' '.repeat(width)} | ${' '.repeat(start.column)}${'^'.repeat(Math.max(1, length))}`,
      )
    }
  }
  return frame.join('\n')
}
