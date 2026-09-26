import type { Module } from 'yuku-analyzer'
import type {
  Expression,
  Node,
  ObjectExpression,
  ObjectProperty,
  Program,
  ProgramStatement,
} from '@yuku-toolchain/types'
import type { Config, DeletableNodes, HmrStyle } from '../config'
import type { CodeSplitGroupings } from '../constants'
import type { SplitNodeMeta } from './types'

export type CompileCodeSplitReferenceRouteOptions = {
  codeSplitGroupings: CodeSplitGroupings
  deleteNodes?: Set<DeletableNodes>
  targetFramework: Config['target']
  filename: string
  id: string
  addHmr?: boolean
  hmrStyle?: HmrStyle
  hmrRouteId?: string
  sharedBindings?: Set<string>
}

export type ReferenceRouteCompilerPluginContext = {
  program: Program
  module: Module
  originalNodes: WeakMap<Node, Node>
  insertBefore: (nodes: Array<ProgramStatement>) => void
  renameBinding: (node: Node, name: string) => void
  routeOptions: ObjectExpression
  createRouteFn: string
  opts: CompileCodeSplitReferenceRouteOptions
}

export type ReferenceRouteSplitPropertyCompilerPluginContext =
  ReferenceRouteCompilerPluginContext & {
    prop: ObjectProperty
    splitNodeMeta: SplitNodeMeta
    lazyRouteComponentIdent: string
    opts: CompileCodeSplitReferenceRouteOptions
  }

export type ReferenceRouteCompilerPluginResult = {
  modified?: boolean
}

export type VirtualRouteSplitNodeCompilerPluginContext = {
  program: Program
  renameBinding: (node: Node, name: string) => void
  splitNode: Node
  splitNodeMeta: SplitNodeMeta
}

export type CodeSplitCompilerPlugin = {
  name: string
  getStableRouteOptionKeys?: () => Array<string>
  onRouteOptions?: (
    ctx: ReferenceRouteCompilerPluginContext,
  ) => void | ReferenceRouteCompilerPluginResult
  onAddHmr?: (
    ctx: ReferenceRouteCompilerPluginContext,
  ) => void | ReferenceRouteCompilerPluginResult
  onUnsplittableRoute?: (
    ctx: ReferenceRouteCompilerPluginContext,
  ) => void | ReferenceRouteCompilerPluginResult
  onSplitRouteProperty?: (
    ctx: ReferenceRouteSplitPropertyCompilerPluginContext,
  ) => void | Expression
  onVirtualRouteSplitNode?: (
    ctx: VirtualRouteSplitNodeCompilerPluginContext,
  ) => void
}

export type ReferenceRouteCompilerPlugin = CodeSplitCompilerPlugin
