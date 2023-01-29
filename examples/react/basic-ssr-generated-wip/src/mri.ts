type IsolationMode = 'serverOnly' | 'react-lazy'

export function isolateFn<T extends (...args: any[]) => any>(
  opts: {
    type?: IsolationMode
  },
  fn: T,
): T {
  return fn
}

export function isolate<T>(opts: { type: IsolationMode }, fn: () => T): T {
  return fn()
}
