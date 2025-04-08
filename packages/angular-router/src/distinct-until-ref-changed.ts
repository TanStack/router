import { distinctUntilChanged } from 'rxjs'

export function distinctUntilRefChanged<T>() {
  return distinctUntilChanged<T>(Object.is)
}
