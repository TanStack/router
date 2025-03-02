import React from 'react'

export const ShadowDomTargetContext = React.createContext<
  ShadowRoot | undefined
>(undefined)

export const DevtoolsOnCloseContext = React.createContext<
  | {
      onCloseClick: (e: React.MouseEvent<HTMLButtonElement>) => void
    }
  | undefined
>(undefined)

export const useDevtoolsOnClose = () => {
  const context = React.useContext(DevtoolsOnCloseContext)
  if (!context) {
    throw new Error(
      'useDevtoolsOnClose must be used within a TanStackRouterDevtools component',
    )
  }
  return context
}
