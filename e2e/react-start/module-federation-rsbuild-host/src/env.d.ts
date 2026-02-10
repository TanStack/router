/// <reference types="@rsbuild/core/types" />
/// <reference types="node" />

declare module 'mf_remote/message' {
  import type { ReactNode } from 'react'

  export function FederatedMessage(): ReactNode
}
