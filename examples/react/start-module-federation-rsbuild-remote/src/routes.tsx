import type { ComponentType } from 'react'
import { FederatedMessage } from './message'

export type RemoteRouteRegistration = {
  id: string
  path: string
  component: ComponentType
}

function DynamicRemotePage() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h2>Dynamic remote page from federation</h2>
      <FederatedMessage />
    </main>
  )
}

export const remoteRouteRegistrations: Array<RemoteRouteRegistration> = [
  {
    id: 'dynamic-remote',
    path: 'dynamic-remote',
    component: DynamicRemotePage,
  },
]
