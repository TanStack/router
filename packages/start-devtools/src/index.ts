'use client'

import * as Devtools from './core'

export const StartDevtoolsCore =
  process.env.NODE_ENV !== 'development'
    ? Devtools.StartDevtoolsCoreNoOp
    : Devtools.StartDevtoolsCore

export type { StartDevtoolsInit } from './core'
