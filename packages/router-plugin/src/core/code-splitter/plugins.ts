import type babel from '@babel/core'
import type * as t from '@babel/types'
import type { Config, DeletableNodes } from '../config'
import type { CodeSplitGroupings } from '../constants'

export type CompileCodeSplitReferenceRouteOptions = {
  codeSplitGroupings: CodeSplitGroupings
  deleteNodes?: Set<DeletableNodes>
  targetFramework: Config['target']
  filename: string
  id: string
  addHmr?: boolean
  sharedBindings?: Set<string>
}

export type ReferenceRouteCompilerPluginContext = {
  programPath: babel.NodePath<t.Program>
  callExpressionPath: babel.NodePath<t.CallExpression>
  insertionPath: babel.NodePath
  routeOptions: t.ObjectExpression
  createRouteFn: string
  opts: CompileCodeSplitReferenceRouteOptions
}

export type ReferenceRouteCompilerPluginResult = {
  modified?: boolean
}

export type ReferenceRouteCompilerPlugin = {
  name: string
  onUnsplittableRoute?: (
    ctx: ReferenceRouteCompilerPluginContext,
  ) => void | ReferenceRouteCompilerPluginResult
}
