// src/services/session.server.ts
import { useSession } from '@tanstack/vue-start/server'

type SessionUser = {
  userEmail: string
}

export function useAppSession() {
  return useSession<SessionUser>({
    password: 'ChangeThisBeforeShippingToProdOrYouWillBeFired',
  })
}
