import * as React from 'solid-js'

export function useSessionStorage(key: string, initialValue: any) {
  const [state, setState] = React.createSignal(() => {
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : initialValue
  })

  React.createEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state()))
  })

  return state
}
