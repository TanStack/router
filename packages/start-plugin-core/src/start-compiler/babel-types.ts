/**
 * INTERIM: the Babel-typed extension interfaces of the previous Start
 * compiler, kept internal for the Rsbuild host until its lane moves it to the
 * compiler core. Not public API.
 */
import type * as babel from '@babel/core'
import type * as t from '@babel/types'
import type { GeneratorResult } from '@tanstack/router-utils'
import type { CompileStartFrameworkOptions } from '../types'

export type StartCompilerEnvironment = 'client' | 'server'

export interface StartCompilerImportTransformImport {
  libName: string
  rootExport: string
}

export interface StartCompilerTransformCandidate {
  path: babel.NodePath<t.CallExpression>
}

export interface StartCompilerTransformContext {
  readonly ast: t.File
  readonly code: string
  readonly id: string
  readonly env: StartCompilerEnvironment
  readonly envName: string
  readonly mode: 'dev' | 'build'
  readonly root: string
  readonly framework: CompileStartFrameworkOptions
  readonly providerEnvName: string
  readonly types: typeof t
  parseExpression: (code: string) => t.Expression
  warn?: (message: string) => void
}

export interface StartCompilerImportTransform {
  name: string
  environment?:
    | StartCompilerEnvironment
    | Array<StartCompilerEnvironment>
    | undefined
  imports: Array<StartCompilerImportTransformImport>
  detect: RegExp
  order?: 'pre' | 'post' | undefined
  transform: (
    candidates: Array<StartCompilerTransformCandidate>,
    context: StartCompilerTransformContext,
  ) => void
}

export interface StartCompilerTransformResult {
  code: string
  map?: GeneratorResult['map'] | null
}

export interface StartCompilerVirtualModuleContext {
  readonly id: string
  readonly root: string
  readonly env: StartCompilerEnvironment
  readonly envName: string
  readonly code?: string
}

export interface StartCompilerPlugin {
  name: string
  environment?:
    | StartCompilerEnvironment
    | Array<StartCompilerEnvironment>
    | undefined
  detect?: RegExp | undefined
  virtualModuleIdPattern?: RegExp | undefined
  transformAst?: (
    context: StartCompilerTransformContext,
  ) => boolean | null | undefined
  loadVirtualModule?: (
    context: StartCompilerVirtualModuleContext,
  ) => StartCompilerTransformResult | null
  invalidateModule?: (context: { id: string; envName: string }) => void
}
