import { createStore } from 'solid-js'

export const [auth, setAuth] = createStore<Auth>({
  status: 'loggedOut',
  username: undefined,
  login: (username: string) => {
    setAuth((state) => {
      state.status = 'loggedIn'
      state.username = username
    })
  },
  logout: () => {
    setAuth((state) => {
      state.status = 'loggedOut'
      state.username = undefined
    })
  },
})

export type Auth = {
  login: (username: string) => void
  logout: () => void
  status: 'loggedOut' | 'loggedIn'
  username?: string
}
