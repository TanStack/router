import { createContext } from 'react'

class Context {
  cache = new Map()

  private static instance: Context | undefined

  public static create(): Context {
    if (!Context.instance) {
      Context.instance = new Context()
    }

    return Context.instance
  }

  private createContext<T>(key: string, initialValue: T) {
    const context = createContext(initialValue)

    this.cache.set(key, context)

    return context
  }

  get<T>(key: string, initialValue?: T) {
    return this.cache.get(key) || this.createContext(key, initialValue)
  }
}

const context = Context.create()

export default context
