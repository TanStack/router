import { installSolidSsrTransfer } from './routerPayloadServer'
import { solidSsrTransfer } from './solidSsrTransferSlot'

// Fill the SSR-transfer slot (see solidSsrTransferSlot): loading this module
// — which every Solid SSR/Start server path does before rendering — is what
// arms the Solid-owned dehydrate/payload overrides that Router instances
// registered for at construction.
solidSsrTransfer.install = installSolidSsrTransfer

export { RouterServer } from './RouterServer'
export { defaultRenderHandler } from './defaultRenderHandler'
export { defaultStreamHandler } from './defaultStreamHandler'
export { renderRouterToStream } from './renderRouterToStream'
export { renderRouterToString } from './renderRouterToString'
export { loadFlightTarget } from './loadFlightTarget'
export type { LoadFlightTargetOptions } from './loadFlightTarget'
export * from '@tanstack/router-core/ssr/server'
