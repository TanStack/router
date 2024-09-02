// app/services/session.server.ts
import { useSession } from 'vinxi/http'
import type { User } from '@prisma/client'

type SessionUser = {
  userEmail: User['email']
}

export function useAppSession() {
  return useSession<SessionUser>({
    password: 'ChangeThisBeforeShippingToProdOrYouWillBeFired',
  })
}
