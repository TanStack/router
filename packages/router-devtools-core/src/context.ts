import * as Solid from 'solid-js'

export const ShadowDomTargetContext = Solid.createContext<
  ShadowRoot | undefined
>(undefined)

export const DevtoolsOnCloseContext = Solid.createContext<
  | {
      onCloseClick: (
        e: MouseEvent & { currentTarget: HTMLButtonElement; target: Element },
      ) => void
    }
  | undefined
>(undefined)

export const useDevtoolsOnClose = () => {
  const context = Solid.useContext(DevtoolsOnCloseContext)
  if (!context) {
    throw new Error(
      'useDevtoolsOnClose must be used within a TanStackRouterDevtools component',
    )
  }
  return context
}
