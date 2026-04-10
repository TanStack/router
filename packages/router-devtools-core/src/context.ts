import { createContext, useContext } from 'solid-js'
import type { Context } from 'solid-js'

export const ShadowDomTargetContext: Context<ShadowRoot | undefined> = createContext<ShadowRoot | undefined>(
  undefined,
)

type DevtoolsOnCloseContextValue =
  | {
      onCloseClick: (
        e: MouseEvent & { currentTarget: HTMLButtonElement; target: Element },
      ) => void
    }
  | undefined

export const DevtoolsOnCloseContext: Context<DevtoolsOnCloseContextValue> = createContext<
  | {
      onCloseClick: (
        e: MouseEvent & { currentTarget: HTMLButtonElement; target: Element },
      ) => void
    }
  | undefined
>(undefined)

export const useDevtoolsOnClose = (): { onCloseClick: (e: MouseEvent & { currentTarget: HTMLButtonElement; target: Element }) => void } => {
  const context = useContext(DevtoolsOnCloseContext)
  if (!context) {
    throw new Error(
      'useDevtoolsOnClose must be used within a TanStackRouterDevtools component',
    )
  }
  return context
}
