import { useMemo, useState } from 'react'

export type AuthUser = {
  id: string
  name: string
}

export type AuthState =
  | {
      type: 'authenticated'
      user: AuthUser
    }
  | {
      type: 'unauthenticated'
      hasLoggedIn: boolean
    }

export type AuthHandle = {
  login: (userId: string) => Promise<void>
  logout: () => Promise<void>
}

export const initialAuthState: AuthState = {
  type: 'unauthenticated',
  hasLoggedIn: false,
}

export const initialAuthHandle: AuthHandle = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
}

export function useAuth(): readonly [AuthState, AuthHandle] {
  const [authState, setAuthState] = useState<AuthState>({
    type: 'unauthenticated',
    hasLoggedIn: false,
  })

  const login = async (userId: string) =>
    new Promise<void>((resolve) => {
      // Delay the login with a setTimeout to simulate a network request,
      // and make sure any actions in response are not batched as part of
      // a React request handler.
      setTimeout(() => {
        setAuthState({
          type: 'authenticated',
          user: {
            id: userId,
            name: `User #${userId}`,
          },
        })
        resolve()
      }, 500)
    })

  const logout = async () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        setAuthState((currentState) => ({
          type: 'unauthenticated',
          hasLoggedIn:
            currentState.type === 'authenticated' || currentState.hasLoggedIn,
        }))
        resolve()
      })
    })

  const authHandle = useMemo<AuthHandle>(
    () => ({
      login,
      logout,
    }),
    [login, logout],
  )

  return [authState, authHandle]
}
