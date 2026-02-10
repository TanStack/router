/// <reference types="@rsbuild/core/types" />
/// <reference types="node" />

declare module 'mf_remote/message' {
  import type { ReactNode } from 'react'

  export function FederatedMessage(): ReactNode
}

declare module 'mf_remote/routes' {
  import type { ComponentType } from 'react'

  export type RemoteRouteRegistration = {
    id: string
    path: string
    component: ComponentType
  }

  export const remoteRouteRegistrations: Array<RemoteRouteRegistration>
}

declare module 'mf_remote/server-data' {
  export function getFederatedServerData(source: string): {
    source: string
    message: string
  }
}
