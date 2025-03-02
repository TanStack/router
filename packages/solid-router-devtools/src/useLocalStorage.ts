import * as Solid from 'solid-js'

const getItem = (key: string): unknown => {
  try {
    const itemValue = localStorage.getItem(key)
    if (typeof itemValue === 'string') {
      return JSON.parse(itemValue)
    }
    return undefined
  } catch {
    return undefined
  }
}

export default function useLocalStorage<T>(
  key: string,
  defaultValue: T | undefined,
): [Solid.Accessor<T | undefined>, (newVal: T | ((prevVal: T) => T)) => void] {
  const [value, setValue] = Solid.createSignal<T>()

  Solid.createEffect(() => {
    const initialValue = getItem(key) as T | undefined

    if (typeof initialValue === 'undefined' || initialValue === null) {
      setValue(
        typeof defaultValue === 'function' ? defaultValue() : defaultValue,
      )
    } else {
      // @ts-ignore
      setValue(initialValue)
    }
  }, [defaultValue, key])

  const setter = 
    (updater: any) => {
      setValue((old) => {
        let newVal = updater

        if (typeof updater == 'function') {
          newVal = updater(old)
        }
        try {
          localStorage.setItem(key, JSON.stringify(newVal))
        } catch {}

        return newVal
      })
    }

  return [value, setter]
}
