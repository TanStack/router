import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useDescope } from '@descope/react-sdk'
import * as React from 'react'
import { clearServerSession } from '../integrations/descope/server'

export const Route = createFileRoute('/logout')({
  preload: false,
  component: LogoutComp,
})

function LogoutComp() {
  const sdk = useDescope()
  const router = useRouter()

  React.useEffect(() => {
    async function doLogout() {
      try {
        // Revoke the session with Descope and clear the client-side tokens.
        await sdk.logout()
      } catch (err) {
        console.error('Descope logout error', err)
      }
      try {
        // Clear the server-readable cookies, then refresh and go home.
        await clearServerSession()
        await router.invalidate()
        await router.navigate({ to: '/' })
      } catch (err) {
        console.error('Logout cleanup error', err)
        await router.navigate({ to: '/' })
      }
    }
    doLogout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex justify-center p-12">
      <p className="animate-pulse text-gray-400">Signing out…</p>
    </div>
  )
}
