import * as React from 'react'

const context = React.createContext<string>('')
export const HeadProvider = context.Provider
export const useHead = () => React.useContext(context)
