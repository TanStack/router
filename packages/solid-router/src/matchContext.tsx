import * as Solid from 'solid-js'

export const matchContext = Solid.createContext<
  Solid.Accessor<string | undefined>
>(() => undefined)

export const routeIdContext = Solid.createContext<
  Solid.Accessor<string | undefined>
>(() => undefined)

export const pendingMatchContext = Solid.createContext<Solid.Accessor<boolean>>(
  () => false,
)
