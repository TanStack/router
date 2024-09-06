// app/services/session.server.ts
import { parseCookies, setCookie, useSession } from 'vinxi/http'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@prisma/client'

type SessionUser = {
  userEmail: User['email']
}

export function useSupabase() {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        // @ts-ignore Wait till Supabase overload works
        getAll() {
          return Object.entries(parseCookies()).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookies) {
          cookies.forEach((cookie) => {
            setCookie(cookie.name, cookie.value)
          })
        },
      },
    },
  )
}
