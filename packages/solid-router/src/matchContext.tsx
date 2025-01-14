import * as Solid from 'solid-js'

export const matchContext = Solid.createContext<
  Solid.Accessor<string | undefined>
>(() => undefined)
