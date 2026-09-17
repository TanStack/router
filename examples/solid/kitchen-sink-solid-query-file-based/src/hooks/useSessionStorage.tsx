import * as Solid from 'solid-js'

export function useSessionStorage<T>(key: string, initialValue: T) {
  const stored = sessionStorage.getItem(key)
  const [state, setState] = Solid.createSignal<T>(
    stored ? JSON.parse(stored) : initialValue,
  )

  Solid.createEffect(
    () => JSON.stringify(state()),
    (json) => sessionStorage.setItem(key, json),
  )

  return [state, setState]
}
