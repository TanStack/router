import * as Solid from 'solid-js'

export const matchContext = Solid.createContext<
  Solid.Accessor<string | undefined>
>(() => undefined)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = Solid.createContext<
  Solid.Accessor<string | undefined>
>(() => undefined)
