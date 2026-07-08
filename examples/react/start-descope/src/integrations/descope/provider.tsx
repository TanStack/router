/// <reference types="vite/client" />
import { AuthProvider } from '@descope/react-sdk'
import type { ReactNode } from 'react'

/**
 * Client-side Descope provider. `sessionTokenViaCookie` stores the session
 * token in a cookie (rather than local storage) so it is sent with the SSR
 * document request and can be validated on the server — see
 * `src/integrations/descope/server.ts`.
 */
export function DescopeProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider
      projectId={import.meta.env.VITE_DESCOPE_PROJECT_ID!}
      baseUrl={import.meta.env.VITE_DESCOPE_BASE_URL}
      sessionTokenViaCookie={{ sameSite: 'Lax' }}
    >
      {children}
    </AuthProvider>
  )
}
